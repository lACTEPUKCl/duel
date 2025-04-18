import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

class DuelModel {
  constructor() {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    this.client = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    this.dbName = "SquadJS";
    this.collectionName = "duels";
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.collection = this.db.collection(this.collectionName);
      await this.createIndexes();
      this.isConnected = true;
      console.log("Successfully connected to MongoDB");
    } catch (err) {
      console.error("MongoDB connection error:", err);
      throw err;
    }
  }

  async initialize() {
    return this.connect();
  }

  async createIndexes() {
    try {
      await this.collection.createIndexes([
        { key: { status: 1 } },
        { key: { challengerId: 1 } },
        { key: { opponentId: 1 } },
        { key: { createdAt: 1 } },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]);
    } catch (err) {
      console.error("Error creating indexes:", err);
      throw err;
    }
  }

  async createDuel(
    interactionId,
    challengerId,
    opponentId,
    betAmount,
    weaponId,
    messageId
  ) {
    await this._ensureConnected();
    const duel = {
      interactionId,
      challengerId,
      opponentId,
      betAmount,
      weaponId,
      messageId,
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      winnerId: null,
      details: null,
    };

    try {
      const result = await this.collection.insertOne(duel);
      return result.insertedId;
    } catch (err) {
      console.error("DuelModel: Error creating duel:", err);
      throw err;
    }
  }

  async findPendingDuel(userId) {
    await this._ensureConnected();
    try {
      return await this.collection.findOne({
        $or: [
          { challengerId: userId, status: "pending" },
          { opponentId: userId, status: "pending" },
        ],
      });
    } catch (err) {
      console.error("DuelModel: Error finding pending duel:", err);
      throw err;
    }
  }

  async findPendingDuelByInteractionId(interactionId) {
    await this._ensureConnected();
    try {
      return await this.collection.findOne({
        interactionId,
        status: "pending",
      });
    } catch (err) {
      console.error(
        "DuelModel: Error finding pending duel by interactionId:",
        err
      );
      throw err;
    }
  }

  async completeDuel(duelId, winnerId, details = {}) {
    await this._ensureConnected();
    try {
      const result = await this.collection.updateOne(
        { _id: duelId },
        {
          $set: {
            status: "completed",
            winnerId,
            completedAt: new Date(),
            details,
          },
        }
      );
      return result.modifiedCount;
    } catch (err) {
      console.error("DuelModel: Error completing duel:", err);
      throw err;
    }
  }

  async cleanupExpiredDuels() {
    await this._ensureConnected();
    try {
      const result = await this.collection.updateMany(
        {
          status: "pending",
          createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) },
        },
        { $set: { status: "expired" } }
      );
      console.log(
        `DuelModel: Cleaned up ${result.modifiedCount} expired duels`
      );
      return result.modifiedCount;
    } catch (err) {
      console.error("DuelModel: Error cleaning up expired duels:", err);
      throw err;
    }
  }

  async close() {
    if (this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        console.log("DuelModel: Connection closed");
      } catch (err) {
        console.error("DuelModel: Error closing connection:", err);
        throw err;
      }
    }
  }

  async _ensureConnected() {
    try {
      await this.client.db("admin").command({ ping: 1 });
    } catch (err) {
      console.log("DuelModel: Connection lost, reconnecting...");
      this.isConnected = false;
      await this.connect();
    }
  }
}

const duelModelInstance = new DuelModel();

export const duelModel = duelModelInstance;

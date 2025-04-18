export const classes = {
  warrior: {
    name: "Warrior",
    description: "Базовый воин, владеющий физическим боем.",
    statMultipliers: {
      strength: 0,
      agility: 0,
      intelligence: 0,
      accuracy: 0,
      hp: 0,
      defense: 0,
    },
    advanced: {
      20: [
        {
          id: "gladiator",
          name: "Gladiator",
          description: "Сильный воин с акцентом на необузданную ярость и мощь.",
          statMultipliers: {
            strength: 1.3,
            agility: 0.9,
            intelligence: 0.8,
            accuracy: 1.0,
            hp: 1.4,
            defense: 1.3,
          },
        },
        {
          id: "warlord",
          name: "Warlord",
          description:
            "Могучий лидер, обладающий повышенной выносливостью и защитой.",
          statMultipliers: {
            strength: 1.25,
            agility: 1.0,
            intelligence: 0.85,
            accuracy: 1.0,
            hp: 1.45,
            defense: 1.35,
          },
        },
      ],
      40: [
        {
          id: "champion",
          name: "Champion",
          description: "Легендарный воин с непревзойденной физической силой.",
          statMultipliers: {
            strength: 1.5,
            agility: 1.0,
            intelligence: 0.8,
            accuracy: 1.05,
            hp: 1.6,
            defense: 1.4,
          },
        },
      ],
      80: [
        {
          id: "titan",
          name: "Titan",
          description: "Воплощение мощи и несокрушимости.",
          statMultipliers: {
            strength: 1.7,
            agility: 1.1,
            intelligence: 0.75,
            accuracy: 1.1,
            hp: 1.8,
            defense: 1.5,
          },
        },
      ],
    },
  },
  mage: {
    name: "Mage",
    description: "Базовый маг, владеющий заклинаниями.",
    statMultipliers: {
      strength: 0,
      agility: 0,
      intelligence: 0,
      accuracy: 0,
      hp: 0,
      defense: 0,
    },
    advanced: {
      20: [
        {
          id: "battlemage",
          name: "Battlemage",
          description: "Маг, сочетающий заклинания с физической атакой.",
          statMultipliers: {
            strength: 0.9,
            agility: 1.0,
            intelligence: 1.4,
            accuracy: 1.1,
            hp: 1.0,
            defense: 0.9,
          },
        },
        {
          id: "spellbreaker",
          name: "Spellbreaker",
          description: "Маг, специализирующийся на разрушительных заклинаниях.",
          statMultipliers: {
            strength: 0.85,
            agility: 1.0,
            intelligence: 1.45,
            accuracy: 1.0,
            hp: 1.0,
            defense: 0.85,
          },
        },
      ],
      40: [
        {
          id: "archmage",
          name: "Archmage",
          description: "Великий маг, владеющий самыми мощными заклинаниями.",
          statMultipliers: {
            strength: 0.8,
            agility: 1.0,
            intelligence: 1.6,
            accuracy: 1.2,
            hp: 1.0,
            defense: 0.8,
          },
        },
      ],
      80: [
        {
          id: "grand_sorcerer",
          name: "Grand Sorcerer",
          description: "Повелитель магии, способный менять исход сражений.",
          statMultipliers: {
            strength: 0.75,
            agility: 1.0,
            intelligence: 1.8,
            accuracy: 1.25,
            hp: 1.0,
            defense: 0.75,
          },
        },
      ],
    },
  },
  archer: {
    name: "Archer",
    description: "Базовый стрелок, мастер дальнего боя.",
    statMultipliers: {
      strength: 0,
      agility: 0,
      intelligence: 0,
      accuracy: 0,
      hp: 0,
      defense: 0,
    },
    advanced: {
      20: [
        {
          id: "ranger",
          name: "Ranger",
          description: "Опытный стрелок с высокой точностью.",
          statMultipliers: {
            strength: 1.0,
            agility: 1.3,
            intelligence: 1.0,
            accuracy: 1.2,
            hp: 1.0,
            defense: 1.0,
          },
        },
        {
          id: "assassin",
          name: "Assassin",
          description: "Мастер скрытных атак и быстрых ударов.",
          statMultipliers: {
            strength: 1.0,
            agility: 1.35,
            intelligence: 1.0,
            accuracy: 1.15,
            hp: 1.0,
            defense: 1.0,
          },
        },
      ],
      40: [
        {
          id: "marksman",
          name: "Marksman",
          description: "Безупречный стрелок, мастер дальнего боя.",
          statMultipliers: {
            strength: 1.0,
            agility: 1.5,
            intelligence: 1.0,
            accuracy: 1.3,
            hp: 1.0,
            defense: 1.0,
          },
        },
      ],
      80: [
        {
          id: "storm_archer",
          name: "Storm Archer",
          description:
            "Легенда среди стрелков, способный наносить молниеносные удары.",
          statMultipliers: {
            strength: 1.0,
            agility: 1.7,
            intelligence: 1.0,
            accuracy: 1.4,
            hp: 1.0,
            defense: 1.0,
          },
        },
      ],
    },
  },
};

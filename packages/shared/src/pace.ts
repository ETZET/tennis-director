/**
 * 游戏节奏：真实时间和游戏时间怎么换算。游戏 app 按它走时间，sim-cli 的可玩性指标按它换算秒数。
 */
export const PACE = {
  /** 1× 每秒走几游戏分钟（营业日 12 小时约 3 分钟） */
  minutesPerSecond: 4,
  /** 没有卡开着、总监也没在走路时，时间走得快几倍（没事可做就别让玩家干等） */
  idleSpeedup: 2,
} as const;

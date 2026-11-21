# 卡牌数据说明

《璀璨宝石》宝可梦基础版包含 90 张牌，依次为一阶 35 张、二阶 30 张、三阶 15 张、稀有 5 张、传说及幻之宝可梦 5 张。每个 id 指一张实体牌的数值变体。55 个不同物种使用全国图鉴编号 dex，以便对应简体中文名称和插画。

卡牌数值对照了两份公开的玩家转录。第一份由 Tabletop Simulator 模组卡面整理，第二份据作者说明由 BoardGameGeek 社区表生成。两份数据中，90 张基础牌的种名、等级、分数、永久奖励、捕捉费用、进化目标与进化条件全部对应。本次核对未使用实体原盒。页面仅收录数值事实及物种名称，来源中的卡图和规则原文不随这份数据提供。

- [卡面转录表](https://github.com/Ethan9123/pokemon-splendor/blob/main/data/cards.json)
- [社区卡表与图鉴映射](https://github.com/LeonJoeeee/splendor-pokemon/blob/main/src/data/cards.ts)
- [物种简体中文名称与图鉴编号](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv)
- [日文规则书译本](https://eapelly.com/wp-content/uploads/2024/03/Splendor-Pokemon-Japanese.pdf)
- [对照韩文实体规则书的游戏指南](https://boardgamemate.com/games/splendor_pokemon)

cost 始终包含 red、blue、black、pink、yellow、purple 六个非负整数，分别为精灵球、超级球、高级球、治愈球、先机球和大师球的需求量。bonus 指卡牌提供永久奖励的颜色，bonusCount 为数量。evolvesTo 是下一阶物种名的数组，基础版中每张牌最多有一个进化目标。evoCost 是所需的永久奖励颜色与最小数量，不能进化的牌为 null。

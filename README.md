# 一块钱 · 百年账本

「风雨如磐」的信息配套站 —— https://airdiode.github.io/Fengyu/

主站把那个年代的地图、人物、机构、灾荒摆好；这一站只回答其中一个很小的问题：
**那年的一块钱，能买什么。**

## 两个页面

| 页面 | 内容 |
|---|---|
| [index.html](index.html) | 一屏：1931 年 6 月，青岛，一块银元 = 16.1 斤小米 |
| [timeline.html](timeline.html) | 五步论证：这 16.1 斤是怎么变成 1943 年北平的 1.4 斤的 |

时间线上还标了 7 条同期历史事件（九一八、一二八、白银风潮、法币改革、淞沪会战等），
**只作时间参照，不表示因果**。

## 数据

| 层 | 规模 |
|---|---|
| 指数序列 | 111 条，13,935 个观测点（生活费 / 物价 / 金融 / 外贸 / 工资） |
| 商品价格 | 6 个城市-年份截面，414 条商品记录 |
| 同期事件 | 7 条（编辑层，不参与计算） |

每一条都能回到出处：`data/series.js` 里带源文件名、责任机构与数据来源。

## 技术

纯静态：无框架、无构建、无 CDN、无 webfont、无图片外链。
`file://` 下双击即可打开，功能完整。

```
index.html          一个数（卡片）
timeline.html       五步论证
assets/base.css     页头（形制参照「风雨如磐」）
assets/card.css     卡片样式
assets/story.css    长页样式
assets/story.js     长页脚本（手写 SVG）
assets/mark.svg     站点标记
data/series.js      window.LEDGER（指数层）
data/basket.js      window.LEDGER_BASKET（购物篮层）
data/events.js      window.LEDGER_EVENTS（编辑层）
data/validate.js    LEDGER_VALIDATE() 校验器
```

## 三个已知边界

1. **工资几乎不存在。** 全库 592 条工资序列，最长一条 52 个月。所以不谈「实际工资」。
2. **82 条粮食按「市石」计价。** 容积换重量需粮种容重依据，缺依据不换算，未入购物篮。
3. **商品价格只有 6 个截面。** 连不成曲线，只做同年同币的横截面。

另有 13 个源表疑误值（疑似小数点错位，如 1135 应为 113.5）。**原值保留、不按推断改写**，
在图上断开连线、边缘画空心圈标出。

## 本地查看

```
git clone https://github.com/airdiode/ledger
cd ledger
open index.html      # 或直接双击
```

## 许可

- 代码：MIT
- 数据：见 [NOTICE.md](NOTICE.md)

纠错与建议：contact@airdiode.com

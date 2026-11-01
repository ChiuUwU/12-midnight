# 最后一夜标题字标

`last-night-wordmark-v1.svg` 是基于已随项目保存的站酷小薇四字子集制作的矢量标题：字身加厚、金属分层切面、边缘高光与星芒。背景透明，可缩放；不是图像模型生成的结果。2026-11-01 按用户要求去掉字标下方月牙，生成脚本同步修改，防止重建后复现。

本轮原计划使用内置 image_gen 制作字标，但服务返回 403，没有产生可用图像；未切换付费 API。生成提示词保存在 `title-image-brief.txt` 供以后重试。

矢量构建：`python scripts/build-title-wordmark.py`，使用现有 FontTools，不安装新依赖。字体源与许可证见 `../fonts/README.md`、`../fonts/OFL-ZCOOL-XiaoWei.txt`。正文和游戏内字体不变。

## 独立图像候选（不自动接入）

- `last-night-wordmark-image-candidate-v2.png`：2026-11-01 内置图像生成工具重试成功，2172×724 RGBA，已确认带透明通道。偏厚重、尖刺化的金属风格，未接入首页。
- `title-image-no-moon-brief.txt` 为其完整提示词，明确只保留四字、不添加月亮或其他图案。
- 后续参考霍格沃茨字标气质的修长、细衬线、克制浅金方向，提示词在 `title-image-refined-brief.txt`；候选须用户认可后再替换，不能将“生成成功”等同已接入。
- `last-night-wordmark-refined-candidate-v3.png`：按上述方向再次生成成功，2172×724 RGBA，透明背景，无额外月牙。仍属于待审候选，并非已接入的最终字标。两张图均由内置图像生成接口产生；该接口不提供可核验的手动模型选择参数，因此不宣称显式指定了 image2.0。

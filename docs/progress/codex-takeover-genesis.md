DONE — take-genesis (local repairs + final visual verification)

## Ownership returned to Claude — current handoff
- Claude owns `client/app/`, `client/edu/`, `client/render/`, and `client/genesis/` again. Codex will not edit those directories from this point onward.
- Current `git status --short` for all four UI directories is **clean**: no uncommitted UI work remains to hand off. The earlier Genesis changes below are preserved in the committed workspace.
- This agent retains only its original server-side `genesis/` responsibility when assigned further work. The takeover implementation/validation notes below are historical evidence, not continuing UI ownership.

## 接手与边界
依据 `/tmp/herdr-codex-takeover-20261024/genesis-TASK.md`，已读 brief、相关 Genesis/portrait/edu/archetype cards、原 claude-genesis progress、terminal/source 与原 session 最新用户消息。负责 `client/genesis/` + 原 `genesis/` server builder；UI mount 交 take-ui，edu 组件交 take-edu，renderer 的唯一 frame 集成由 take-lead 完成。保留共享脏改动；未 commit/push/deploy、未读 .env、未触碰其他 owner 实现，未重启 5175/5173。

## 已修复
- 延续既有终端像素风、VT323/Press Start 2P 与分层 canvas；没有重写六阶段动画。
- `sprites.ts` 消费 renderer 的真实 `portraitWeaponLayer` 与 coordinator 导出的 `portraitFrame`，移除手工复制的 hand/rotation/frame 公式。英雄源画布由旧32/64改64/128，完整头部和武器进入画布；小 host 允许 nearest-neighbor 缩小，避免最低倍率强制溢出。
- hero cache 使用 renderer 的 `lookFor(kit).key`，boss cache 包含完整 kit，避免同 repo 更新代码武器/器官后继续显示旧资产。
- demo 保留 sim 的完整24字符代码表达式，不再截到20字符，也不再套用旧 art asset 中已截断的 weaponName。reveal 按空白换行，函数名/括号不切开。
- **EDU-6**：kit-only fallback 在 `quality` 存在或显式 edu mode 时输出 `code quality → stats: see your report card`、真实 quality rows 与空 budget；未知 files/LOC 用0，不再虚构1000 LOC/10 files。离线 `buildGenesisLocal` 直接复用现有纯 TS server builder，不维护第二套过期规则。
- 同 slug 的新 genesis 会刷新真实数据并保留当前阶段；内容相同的 lobby JSON 不重建。已完成场景不重复触发 onDone，replay/reset/dispose 正常。
- 手机 report-card 的 tech-debt 标签不再覆盖 grade；列宽按实际标签计算，并将能识别的真实 signal 数字前置。未知文案保留原 signal，不重算 grade/stat。
- **原 server builder 责任**：`attackReason` 改为真实 source + archetype preset/kind，不把 preset 技能谎报为 files/fan-out 触发。测试固定4套 deck 顺序、9个真实 source/slot、精确 attack IDs，覆盖2种 heart 位置与全部8攻击类型；保持总 threat share=1。

## Snapshot 边界与协调
- 17:16：已通知 take-lead runtime 可 snapshot；当时 focused58 PASS +全项目typecheck PASS。
- 17:20：实际看 phone-edu 后仅补改 `client/genesis/scene.ts` report列宽/文案；已通知 take-lead 替换冻结副本该文件。此后未修改 runtime。新增换行测试属于测试文件。
- 17:26：take-lead 唯一跨界调整 `portraitFrame` 为 big4 `logical=L.extent*2 (256), bx=96, by=112`；legacy保持176/88/80。本 agent 不改 renderer。
- 私有 Vite **127.0.0.1:5198**（验收完成后已停止自己的进程，复跑命令见证据段）。首次测试发现该私服曾返回旧32px模块；仅重启自己的5198后，真实 renderer RGBA 对照通过。没有动共享/线上服务。

## 已有验证
- `npx vitest run client/genesis genesis`: **59 PASS**；`npm run typecheck`: **PASS**；owned `git diff --check`: **PASS**。
- Playwright `/tmp/gitzilla-takeover-genesis/verify.mjs`：7武器×普通/edu **14组 RGBA 全等**于 `portraitWeaponLayer`；4 archetype 的 limb/heart 坐标全等于真实 frame/layout；weapon cache 更新、same-slug refresh、相同JSON不重建、onDone一次、replay/dispose 均通过。
- 17截图已基于最终256 frame重拍并逐张实际查看：desktop hero/map/edu、390px phone hero/edu、360px edu、4 archetype 的projector与phone、Hydra map、condensed Mecha与reduced-motion Hydra。手机报告重叠、头/武器及尾/翼硬裁已消除。
- 额外 `/tmp/gitzilla-takeover-genesis/bounds-body.mjs`：640×640透明画布、4形态×native及8-limb最长tail115样本×13pose×4时点×2phase×2方向 = **1664样本**；alpha≥1/40分别记录。casting=null 排除任意 world-target 线，death只记录不纳portrait frame。
- 旧frame确实硬裁：large `bossPortrait(512)`还原logical右界为87.5（hydra/mecha/abyssal）且hydra顶界恰-80；big transparent live body继续延伸到右132+。已向take-lead报告，促成其256几何修复。
- **最终 frame 验收 PASS**：见下表；所有非death body/入口样本均在256 frame内，最小余量15px。large bossPortrait(512)不再碰内部裁边。Scene实际变换检查中 roar/fly/emerge 无额外 graph 溢出；Abyssal idle/windup仅2 logical px底部阴影，lead已明确接受，不扩大范围。
- 最终 `npx vitest run client/genesis genesis`：**59 PASS**；全项目 `npm run typecheck`：**PASS**；owned diff-check：**PASS**。
- `npm run build -- --outDir /tmp/gitzilla-takeover-genesis/build --emptyOutDir`：**PASS**（临时独立产物，未写共享dist）。仅有原有大chunk/static-dynamic import提示。
- take-lead告知合并后的 root suite **720 PASS**，本agent不重复已冻结server/sim/input长playtests；此数字是coordinator验收结果，区别于上面的本地59项focused证据。

### 最终 non-death alpha≥1 world bounds / frame余量

| archetype | bounds [x0,y0 .. x1,y1] | 256/96/112 内 L/R/T/B 余量 |
| --- | --- | --- |
| kaiju | [-75,-90 .. 142,115] | 21 / 17 / 22 / 28 px |
| hydra | [-76,-95 .. 142,106] | 20 / 17 / 17 / 37 px |
| mecha | [-75,-80 .. 142,115] | 21 / 17 / 32 / 28 px |
| abyssal | [-81,-55 .. 144,92] | 15 / 15 / 57 / 51 px |

### 最终证据
- `/tmp/gitzilla-takeover-genesis/REPORT.md`：结论、范围与margin。
- `results.json`：17 screenshots、14组weapon RGBA parity、4 frame/anchor映射、lifecycle与零browser错误。
- `bounds-body-poses.json`：1664 null-casting samples、alpha≥1/40、native及8-limb longest-tail115、13姿态/4时点/2phase/2方向；death仅作记录不纳portrait验收。
- `verify.mjs`、`bounds-body.mjs`：可复跑脚本（需要先启动独立 `npx vite --host 127.0.0.1 --port 5198 --strictPort`）。
- `source-sha256.json`：测试源指纹，含client/genesis、server builder、coordinator frame文件。
- `projector-{kaiju,hydra,mecha,abyssal}.png`、`phone-{kaiju,hydra,mecha,abyssal}.png` 及其余9张PNG，均已打开实际查看。

## Handoff to take-ui / take-lead
`playGenesis` 对外 API不变。继续传完整 `genesis/kit/progress`；同slug更新现在会刷新。room mode改变时应 dispose/recreate handle（mode是创建选项），edu传 `mode:'edu'`，手机传compact，intro传condensed，卸载调用dispose。UI挂载不由本agent改。

## 最终 Handoff to take-lead
本范围完成。已通过Herdr汇报代码变更、snapshot边界、1664 bounds样本与最终17截图。lead确认Abyssal新图完整尾部、当前runtime不再变更；本agent亦不再写runtime。无需放大world-target线、death或2px阴影。只改了自己的 `client/genesis/`、`genesis/` 与progress；renderer唯一frame修复属于take-lead。没有commit/push/deploy。

## 证据与限制
脚本、截图、JSON均在 `/tmp/gitzilla-takeover-genesis/`；浏览器验证为桌面 Chromium 的phone/DPR3与projector viewport模拟，**真实手机、真实投影硬件、完整app挂载验收仍由对应owner/lead执行，不宣称完成**。未重跑已冻结 server/sim/input 长 gameplay sweep。

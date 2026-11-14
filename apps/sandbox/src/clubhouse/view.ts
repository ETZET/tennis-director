// 会所的"看法"：外观，或者里面的某一层（剖面 / 娃娃屋）。每个网格 / 摆好的资产带 userData.houseViews（在哪几种看法里显示），
// applyView(组, 看法) 按它切 visible。没有 houseViews 的东西（地面、围墙、四周的植物、邻居）一直显示。
// 旧接口：userData.houseMode = 'in' | 'out'（一层的东西）照样认：'in' = 只在一层剖面、'out' = 只在外观（和二层剖面：一层外面的样子）。
//
// 规则（viewsFor）：东西属于某一层 level（−1 = 负一层、1 = 一层、2 = 二层），mode = 'in'（只在剖面）/ 'out'（只在外观）/ 不给（都在）。
// - 外观 'out'：mode ≠ 'in' 且 level ≥ 1（地下的东西看不到）。
// - 剖面看第 f 层：level = f 的东西 mode ≠ 'out'（切墙、家具、里面的人）；level < f 且 level ≥ 1 的东西按外观显示（看二层时一层是外面的样子：
//   整高的外墙、不在二层下面的那几片屋顶）；level > f 的都藏起来（上面的楼层、屋顶）；看一层、二层时负一层整个藏起来（在地下）。
export type Floor = -1 | 1 | 2;
export type HouseView = 'out' | 'b1' | '1f' | '2f';
export type HouseMode = 'in' | 'out';
export const FLOORS: Floor[] = [-1, 1, 2];
export const viewOf = (inside: boolean, floor: Floor): HouseView =>
  !inside ? 'out' : floor === -1 ? 'b1' : floor === 2 ? '2f' : '1f';
const FV: Record<Floor, HouseView> = { [-1]: 'b1', 1: '1f', 2: '2f' };

/** 某一层、某个 mode 的东西在哪几种看法里显示 */
export function viewsFor(level: Floor = 1, mode?: HouseMode): HouseView[] {
  const out: HouseView[] = [];
  if (mode !== 'in' && level >= 1) out.push('out');
  for (const f of FLOORS) {
    if (level === f ? mode !== 'out' : level < f && level >= 1 && mode !== 'in') out.push(FV[f]);
  }
  return out;
}

/** 给一个对象打上看法（覆盖旧的 houseMode） */
export function tagViews(o: { userData: Record<string, unknown> }, views: HouseView[]) {
  o.userData.houseViews = views;
}

/** 按看法切 visible：有 houseViews 的按它；只有旧的 houseMode 的按一层的规则 */
/**
 * 在这种看法里显示吗。进楼是沉浸式的：userData.houseOutside = true 的东西（会所外面：地面、围墙、邻居、四周的植物、
 * 外面走的人）只在外观里显示，看任何一层的剖面都藏起来（楼里看不到外面）。
 */
export function visibleIn(ud: Record<string, unknown>, view: HouseView): boolean | null {
  const outside = ud.houseOutside === true;
  const vs = ud.houseViews as HouseView[] | undefined;
  if (vs) return vs.includes(view) && (!outside || view === 'out');
  const m = ud.houseMode as HouseMode | undefined;
  if (m) return viewsFor(1, m).includes(view) && (!outside || view === 'out');
  return outside ? view === 'out' : null;
}

/** 按看法切 visible：有 houseViews 的按它；只有旧的 houseMode 的按一层的规则；houseOutside 的只在外观 */
export function applyView(
  root: { traverse(cb: (o: { userData: Record<string, unknown>; visible: boolean }) => void): void },
  view: HouseView,
) {
  root.traverse((o) => {
    const v = visibleIn(o.userData, view);
    if (v !== null) o.visible = v;
  });
}

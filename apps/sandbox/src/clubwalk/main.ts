// clubwalk：把做好的俱乐部场景连成一个大世界，总监在里面走来走去（试验中，docs/lab/2026-11-07-3d-pixel/clubwalk.md）。
// 整个世界在 walk.ts（mountWalk）；山谷（src/valley）也用它，带着山谷的钩子。
import '../clubsite/render/colors';
import { mountWalk } from './walk';

mountWalk();

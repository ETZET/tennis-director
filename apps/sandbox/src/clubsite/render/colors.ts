// 渲染核心（clubsite/render）：各场景共用这一份。
// 颜色管理关掉：THREE.Color(hex) 存的就是 sRGB 原值，渲染输出也不再转换 —— 调色板写多少屏幕上就是多少。
// 每个场景的 main.ts 必须**第一个** import 这个文件（部件模块顶层也会建颜色，ES 模块按 import 顺序执行）。
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

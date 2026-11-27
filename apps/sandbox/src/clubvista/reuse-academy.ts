// 青训场（academy）只读复用的资产：会员场（clubcourts）的训练小件、遮阳帆；共用（clubsite）的捡球篮、匹克球网（当迷你场的矮网）、散一地的网球。
import { build as courtSail } from '../clubcourts/assets/court-sail';
import { build as drillKit } from '../clubcourts/assets/drill-kit';
import { build as ballHopper } from '../clubsite/assets/ball-hopper';
import { build as pickleNet } from '../clubsite/assets/pickle-net';
import { build as tennisBall } from '../clubsite/assets/tennis-ball';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

export const REUSED: Record<string, AssetBuild> = {
  'academy:drill-kit': as(drillKit),
  'academy:sail': as(courtSail),
  'academy:hopper': as(ballHopper),
  'academy:mini-net': as(pickleNet),
  'academy:balls': as(tennisBall),
};

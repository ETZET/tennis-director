// Drive a running playtest bridge through an idle game (never touch anything), shooting at given days at ~13:00.
const [port, prefix] = [process.argv[2], process.argv[3] ?? ''];
const days = (process.argv[4] ?? '1,7,30,60,98').split(',').map(Number);
const get = async (p) => (await fetch(`http://127.0.0.1:${port}${p}`)).json();
const clock = (st) => {
  const m = /Day\s+(\d+)\D+(\d+):(\d+)\s*(AM|PM)/i.exec(st.clock ?? '');
  if (!m) return { day: 0, h: 0 };
  let h = (Number(m[2]) % 12) + Number(m[3]) / 60;
  if (m[4].toUpperCase() === 'PM') h += 12;
  return { day: Number(m[1]), h };
};
for (const d of days) {
  let st = await get('/state');
  for (let g = 0; g < 600 && !st.outcome; g++) {
    const c = clock(st);
    if (c.day > d || (c.day === d && c.h >= 12.95)) break;
    const left = c.day < d ? 720 : Math.max(1, Math.round((13 - c.h) * 60));
    st = await get(`/wait/${left}`);
  }
  const shot = await get(`/shot/${prefix}day${String(d).padStart(3, '0')}`);
  console.log(JSON.stringify({ target: d, clock: st.clock, weather: st.weather, season: st.season, strip: st.strip,
    staff: st.staff?.map((x) => x.text), card: st.card?.headline ?? null, shot: shot.path }));
}

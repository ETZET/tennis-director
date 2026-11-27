# 收集界面和演员表会用到的字（CJK + 全角标点），写成 pyftsubset 的 --text-file
import pathlib
import sys

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
dirs = ['clubsite/hud', 'clubsite/castui', 'clubsite/cast', 'clubvista', 'clubgame']
chars = set()
for d in dirs:
    for p in (src / d).rglob('*.ts'):
        if p.name.endswith('.test.ts'):
            continue
        for c in p.read_text(encoding='utf8'):
            if '　' <= c <= '鿿' or '＀' <= c <= '￯' or c in '·…—–「」『』':
                chars.add(c)
ascii_ = ''.join(chr(i) for i in range(0x20, 0x7f))
out.write_text(ascii_ + ''.join(sorted(chars)), encoding='utf8')
print(len(chars), 'cjk chars')

# -*- coding: utf-8 -*-
# §6.5 Task 雙向修改 連動公式測試（測試先行，期望值來自 Excel WORKDAY 口徑）
from datetime import date, timedelta

HOLIDAYS = {
    "2025-10-06","2025-10-10","2025-10-24","2025-12-25","2026-01-01","2026-01-02",
    "2026-02-16","2026-02-17","2026-02-18","2026-02-19","2026-02-20","2026-02-27",
    "2026-04-03","2026-04-06","2026-05-01","2026-06-19","2026-09-25","2026-09-28",
    "2026-10-09","2026-10-26","2026-12-25","2027-01-01","2027-02-05","2027-02-06",
    "2027-02-07","2027-02-08","2027-02-09","2027-02-28",
}

def is_workday(d):
    if d.weekday() >= 5: return False
    if d.isoformat() in HOLIDAYS: return False
    return True

def add_workdays(start, n):
    d = start
    if n == 0: return d
    step = 1 if n > 0 else -1
    remaining = abs(n)
    while remaining > 0:
        d = d + timedelta(days=step)
        if is_workday(d): remaining -= 1
    return d

def workdays_between(s, e):
    if s > e: return 0
    count = 0; d = s
    while d <= e:
        if is_workday(d): count += 1
        d = d + timedelta(days=1)
    return count

def D(s):
    y,m,dd = map(int, s.split("-")); return date(y,m,dd)

PASS = 0; FAIL = 0
def check(label, got, exp):
    global PASS, FAIL
    ok = (got == exp)
    if ok: PASS += 1
    else: FAIL += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: got={got} exp={exp}")

print("=== 群組1-2 改開始日/工期→算完成日 end=addWorkdays(start,dur-1) ===")
check("start=6/01 dur=5",  add_workdays(D("2026-06-01"),4).isoformat(), "2026-06-05")
check("start=6/01 dur=6 跨末", add_workdays(D("2026-06-01"),5).isoformat(), "2026-06-08")
check("start=6/04 dur=5 跨末", add_workdays(D("2026-06-04"),4).isoformat(), "2026-06-10")
check("start=6/01 dur=1 當天", add_workdays(D("2026-06-01"),0).isoformat(), "2026-06-01")
check("start=6/01 dur=10 跨兩末", add_workdays(D("2026-06-01"),9).isoformat(), "2026-06-12")
check("start=6/01 dur=3",  add_workdays(D("2026-06-01"),2).isoformat(), "2026-06-03")
check("start=6/15 dur=5 跨端午", add_workdays(D("2026-06-15"),4).isoformat(), "2026-06-22")
check("start=6/17 dur=3 跨端午+末", add_workdays(D("2026-06-17"),2).isoformat(), "2026-06-22")

print("=== 群組3 改完成日→回算工期 dur=workdaysBetween(start,end) ===")
check("6/01→6/05", workdays_between(D("2026-06-01"),D("2026-06-05")), 5)
check("6/01→6/08 跨末", workdays_between(D("2026-06-01"),D("2026-06-08")), 6)
check("6/01→6/01 當天", workdays_between(D("2026-06-01"),D("2026-06-01")), 1)
check("6/15→6/23 跨端午", workdays_between(D("2026-06-15"),D("2026-06-23")), 6)

print("=== 群組4 負工期 完成日<開始日 ===")
check("6/05→6/01 回0", workdays_between(D("2026-06-05"),D("2026-06-01")), 0)

print("=== 群組5 跨國定假日驗證 ===")
check("6/19端午 is_workday=False", is_workday(D("2026-06-19")), False)
check("6/20週六 is_workday=False", is_workday(D("2026-06-20")), False)
check("6/18週四 is_workday=True", is_workday(D("2026-06-18")), True)

print(f"\n=== 結果：{PASS} PASS / {FAIL} FAIL ===")
import sys; sys.exit(1 if FAIL else 0)

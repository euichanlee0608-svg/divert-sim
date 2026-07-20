# -*- coding: utf-8 -*-
"""검증된 물리 엔진으로 대표 교전 궤적을 뽑아 웹앱용 data.js(JSON)로 내보낸다.
simulate()를 건드리지 않고 동일 루프를 재현하되 F(측추력)·궤적을 프레임별 캡처."""
import json
import math
import sys
from pathlib import Path

import numpy as np

DRIVE = Path("/Users/leechan/Library/CloudStorage/GoogleDrive-euichanlee0608@gmail.com/"
             "내 드라이브/개인 연구/측추력기 미사일")
sys.path.insert(0, str(DRIVE))
from missile_sim.core.params import (MissileParams, ScenarioParams, TargetParams,
                                     WarheadParams)
from missile_sim.core.physics import Design, initial_aim, pn_command, rk4_step
from missile_sim.core.target import EvasiveDrone


def run(des, tp, seed, mp=None, sc=None, wp=None, stride=2):
    mp = mp or MissileParams(); sc = sc or ScenarioParams()
    wp = wp or WarheadParams()
    rng = np.random.default_rng(seed)
    th0 = initial_aim(tp, sc)
    s = np.array([0., 0., mp.v0 * math.cos(th0), mp.v0 * math.sin(th0),
                  th0, 0., mp.m0])
    drone = EvasiveDrone(tp, rng)
    h = sc.dt
    prev = float(np.linalg.norm(drone.pos - s[:2])); mindist = prev
    closing = False; deton = False; det_i = -1
    F_applied = 0.0
    frames = []
    n = int(sc.t_max / h)
    i = 0
    for step in range(n):
        r_meas = (drone.pos - s[:2]) + rng.normal(0, sc.sigma_pos, 2)
        vrel_meas = (drone.vel - s[2:4]) + rng.normal(0, sc.sigma_vel, 2)
        F_cmd = pn_command(s, r_meas, vrel_meas, des)
        F_applied += (F_cmd - F_applied) * (h / mp.tau_ctrl)
        s = rk4_step(step * h, s, h, F_applied, des.d_mount, mp)
        drone.step(step * h, s[:2], h)
        t = (step + 1) * h
        if step % stride == 0:
            spd = math.hypot(s[2], s[3])
            frames.append([round(s[0], 1), round(s[1], 1), round(s[4], 3),
                           round(float(drone.pos[0]), 1), round(float(drone.pos[1]), 1),
                           round(abs(F_applied), 1), round(spd, 1)])
        if s[1] < 0:
            break
        dist = float(np.linalg.norm(drone.pos - s[:2])); mindist = min(mindist, dist)
        if t >= wp.t_arm:
            if dist < prev:
                closing = True
            elif closing and dist > prev and prev <= wp.fuze_max_range:
                deton = True; det_i = len(frames) - 1; mindist = min(mindist, prev)
                break
        if s[0] > drone.pos[0] + 100:
            break
        prev = dist
    hit = bool(deton and mindist <= wp.R_eff)
    return {"frames": frames, "hit": hit, "detonated": bool(deton),
            "det_i": det_i, "min_dist": round(mindist, 1),
            "R_eff": wp.R_eff, "R_det": tp.R_det,
            "drone_x0": tp.x0, "drone_y0": tp.y0}


def main():
    scenarios = []
    # 1) HIT — 최적설계급 vs 7g 회피 드론
    scenarios.append({
        "id": "hit", "title_ko": "요격 성공 — 최적 divert 설계",
        "title_en": "Intercept — optimized divert design",
        "desc_ko": "비례항법 유도 + 충분한 측추력(300N)으로 7g 회피 드론을 살상반경 내 기폭.",
        "desc_en": "PN guidance + ample divert (300N) detonates within lethal radius vs a 7g evasive drone.",
        **run(Design(0.3, 300, 5, 2), TargetParams(a_evade=70, R_det=250), seed=7)})
    # 2) ESCAPE — 약한 측추력(권한 부족)
    scenarios.append({
        "id": "escape", "title_ko": "드론 회피 성공 — 측추력 권한 부족",
        "title_en": "Drone escapes — insufficient divert authority",
        "desc_ko": "측추력이 약하면(90N) 유도가 옳아도 몸을 못 꺾어 놓친다.",
        "desc_en": "With weak divert (90N), even correct guidance cannot bend the path in time.",
        **run(Design(0.3, 90, 5, 2), TargetParams(a_evade=70, R_det=250), seed=3)})
    # 3) NO GUIDANCE — 유도 없음(N=0)
    scenarios.append({
        "id": "noguide", "title_ko": "무유도 대조군 — 측추력 미점화",
        "title_en": "No-guidance control — thruster idle",
        "desc_ko": "유도게인 N=0이면 측추력을 안 쓰고 초기 조준선대로 날아가 크게 빗나간다.",
        "desc_en": "With N=0 the thruster stays idle; the missile flies the initial aim and misses widely.",
        **run(Design(0.3, 300, 0, 2), TargetParams(a_evade=70, R_det=250), seed=7)})

    # 결과 데이터(현재 지연 반영 실행값)
    comparison = [
        {"algo": "Genetic (GA)", "J": 0.631, "hit": 100, "fuel": 339, "evals": 458, "win": True},
        {"algo": "Grid Search", "J": 0.654, "hit": 100, "fuel": 364, "evals": 2401, "win": False},
        {"algo": "Gradient (L-BFGS-B)", "J": 0.637, "hit": 100, "fuel": 343, "evals": 1960, "win": False},
        {"algo": "RL (PPO)", "J": 9.09, "hit": 25, "fuel": 942, "evals": 600000, "win": False},
    ]
    sweep = {
        "g": [3.1, 5.1, 7.1, 9.2], "R": [150, 250, 350, 450],
        "reqF": [[125, 175, 200, 175], [125, 250, 275, 200],
                 [200, None, 300, None], [None, None, 300, None]],
    }
    data = {"scenarios": scenarios, "comparison": comparison, "sweep": sweep}
    out = Path(__file__).parent / "data.js"
    out.write_text("window.SIM = " + json.dumps(data, ensure_ascii=False) + ";\n")
    total = sum(len(s["frames"]) for s in scenarios)
    print("wrote", out, "| scenarios:", len(scenarios), "| frames:", total,
          "| size:", out.stat().st_size)
    for s in scenarios:
        print(f"  {s['id']:8s} hit={s['hit']} deton={s['detonated']} "
              f"min_dist={s['min_dist']}m frames={len(s['frames'])}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""SODA-LERNPORTAL(학습 포탈) 도구: 학생 아이디와 비밀번호로 리포트와 시험 기록을 암호화해 data/ 에 저장합니다.

로그인: 학생이 아이디(이름)와 비밀번호 20자리를 입력합니다. 파일 이름은 아이디에서 계산한 값이라
저장소만 봐서는 누가 등록되어 있는지 알 수 없습니다. 비밀번호와 관리 비밀번호는 저장소에 저장하지 않습니다.

사용법 (저장소 루트에서 실행)
  python3 tools/hareport.py init-admin [--replace-legacy]
      관리자 파일(아이디 김종훈)을 만들고 관리 비밀번호를 한 번만 출력합니다. 처음 한 번만 실행합니다.
      관리자 파일에는 학생 명단과 학생 비밀번호가 들어 있어, 로그인 화면에서 김종훈으로 로그인하면 관리자 페이지가 열립니다.
      옛 data/admin.bin(가짜 파일 목록)이 있으면 --replace-legacy 로 지웁니다.
  python3 tools/hareport.py new-student --name 김민서 --level B1 --admin-password 관리비밀번호 [--id 김민서2] [--password 20자리비밀번호] [--grammatik]
      새 학생을 만들고 20자리 학생 비밀번호를 한 번만 출력합니다. 아이디는 기본이 이름입니다.
      같은 이름이 두 명이면 --id 로 다른 아이디를 줍니다. 명단에도 자동으로 들어갑니다.
  python3 tools/hareport.py link-student --id 김민서 --password 학생비밀번호 --admin-password 관리비밀번호
      이미 있는 학생을 관리자 명단에 넣습니다. 비밀번호를 모르면 --no-password 로 넣고 관리자 페이지에서 나중에 입력합니다.
  python3 tools/hareport.py remove-student --id 김민서 --admin-password 관리비밀번호
      학생을 뺍니다. 학생 파일은 무작위 바이트로 덮어써서 가짜 파일이 되고, 그 학생은 로그인할 수 없습니다.
  python3 tools/hareport.py list-students --admin-password 관리비밀번호 [--show-passwords]
  python3 tools/hareport.py pad-students --admin-password 관리비밀번호
      내용이 적은 학생 파일에 무작위 채움을 넣어 가짜 파일과 비슷한 크기로 만듭니다. 새 학생과 기록을 저장할 때는 자동으로 적용됩니다.
  python3 tools/hareport.py set-token --admin-password 관리비밀번호 --token GitHub토큰 [--clear]
      GitHub 토큰을 관리자 파일 안에 관리 비밀번호로 암호화해 넣습니다. 관리자 로그인만 하면 토큰을 따로 입력하지 않아도 됩니다.
  python3 tools/hareport.py add-exam --id 김민서 --password 학생비밀번호 --json exam.json
  python3 tools/hareport.py add-report --id 김민서 --password 학생비밀번호 --level B1 --exam-n 2 --title "Medien im Alltag" --date 2026-10-28 --html 리포트.html
  python3 tools/hareport.py add-voka --id 김민서 --password 학생비밀번호 --week 6 --level A1 --title "VOKA 6주차" --date 2026-10-19 --html VOKA6주차.html
      VOKA 탭에 주차별 학생용 리포트를 등록합니다. 같은 레벨에서 같은 주차를 다시 올리면 덮어씁니다.
      --level 은 A1, A2, B1, B2, C1 입니다. 열람 페이지 VOKA 탭에서는 A1과 A2가 "A1-A2" 버튼 하나로 묶여 보입니다.
  python3 tools/hareport.py enroll-grammatik --id 이지아 --password 학생비밀번호
      문법반 학생에게 GRAMMATIK 탭을 켭니다(리포트 0개). 새 학생은 new-student 에 --grammatik 을 붙여도 됩니다.
  python3 tools/hareport.py add-grammatik --id 이지아 --password 학생비밀번호 --n 1 --title "과제명" --date 2026-11-04 --rate 87 --html 리포트.html
      GRAMMATIK 탭에 리포트를 등록합니다. 같은 번호를 다시 올리면 덮어씁니다.
      --rate 는 그 회차의 정답률(%)이고, 리포트가 2개 이상 쌓이면 GRAMMATIK 탭 위쪽 '실력 향상도' 그래프에 그려집니다.
      다시 올릴 때 --rate 를 생략하면 이전에 넣은 정답률을 그대로 둡니다.
  python3 tools/hareport.py add-result --id 김민서 --password 학생비밀번호 --html "SODA 말하기 결과 telc B2 MDT1 김민서 2026-10-30.html" [--exam "telc B2"] [--title 제목] [--date 2026-10-30]
      "시험 준비" 탭에 결과 하나를 등록합니다. 과제 첨삭과 따로 분류되는 탭입니다.
      SODA SPRECHEN 앱이 만든 말하기 결과 파일은 --html 만 주면 됩니다. 파일 안의 정보로 시험 종류(telc B2, Goethe A2 ...), 제목, 작성일을 자동으로 채웁니다.
      여러 시험이 한 파일에 들어 있으면 시험 종류는 "말하기 종합"이 됩니다. --exam, --title, --date 로 직접 정할 수도 있습니다.
      같은 파일(같은 작성 시각)을 다시 올리면 덮어씁니다. 열람 페이지에서는 시험 종류 버튼으로 나뉘고, 각 시험 안에서 날짜순으로 1회, 2회 ... 로 보입니다.
  python3 tools/hareport.py add-training --id 김민서 --password 학생비밀번호 --html 리포트.html --title "B2 01 · 02" [--kind Lesetraining | --source "학습 결과.txt"] [--n 1] [--date 2026-11-06] [--rate 86]
      "TRAINING" 탭에 훈련 기록 리포트를 등록합니다. 훈련 종류(Lesetraining, Hörtraining, Sprechtraining 등)별로 나뉘어 보입니다.
      --kind 를 주거나, 학생이 보낸 기록 파일을 --source 로 주면 파일 안의 앱 이름(예: "앱: SODA-Lehrwerk Lesetraining")에서 종류를 알아냅니다.
      회차(--n)는 종류 안에서 셉니다. 생략하면 그 종류의 다음 번호이고, 같은 번호를 다시 올리면 덮어씁니다.
      리포트 이름은 '레벨 Set 번호'입니다. Hörtraining은 --title 에 앱의 세트 이름(B2 Set 01, 지문 하나면 B1 Set 01 · Teil 2)을 줍니다.
      Lesetraining은 --title 에 그 리포트가 다룬 텍스트 번호(B2 05, 두 개면 B2 01 · 02)를 주면, 리포트 하나를 세트 하나로 보고
      레벨마다 01부터 세어 세트 이름(B2 Set 03)을 붙입니다. 텍스트 번호는 texts 에 남습니다.
      Schreibtraining은 --title 에 앱의 챕터 번호(B1 01)나 세트 이름(B1 Set 01)을 주면 세트 이름(B1 Set 01)으로 맞춥니다.
      올릴 때 리포트 안의 문서 제목, 제목 회차, 머리말(이름 · 세트), 「지금까지의 기록」 줄의 세트 이름도 자동으로 맞춥니다.
  python3 tools/hareport.py fix-training --id 김민서 --password 학생비밀번호 [--dry-run]
      이미 올린 TRAINING 리포트의 이름을 add-training 과 같은 규칙으로 맞춥니다. --dry-run 은 바뀔 곳만 보여 주고 저장하지 않습니다.
  python3 tools/hareport.py set-prior --id 김민서 --password 학생비밀번호 --level B1 --count 8 [--score 75] [--clear]
      학습 포탈에 올리기 전에 낸 정규 과정(A2, B1, B2) 과제 수를 적어 둡니다. 학생 화면의 "레벨 도달 예상"과 "성취 평가"가
      그 레벨에서 얻은 과제 점수에 이 횟수를 더해 계산합니다. --score 는 그 과제들의 평균 점수(%)이고, 생략하면 등록된 과제의 평균으로 봅니다.
      --clear 는 그 레벨에 적어 둔 값을 지웁니다.
  python3 tools/hareport.py set-sprechen --id 김민서 --password 학생비밀번호 --sp-password 말하기비밀번호 [--sp-id 말하기아이디] [--clear]
      학생의 말하기 연습(SODA Sprechen) 계정을 학생 파일에 넣습니다. 학생이 학습 포탈에 로그인하면 말하기 연습에서는 이 계정으로 바로 로그인됩니다.
      --sp-id 를 생략하면 말하기 아이디를 학생 아이디와 같게 봅니다. --clear 는 연결을 지웁니다. 포탈과 말하기의 아이디·비밀번호가 같은 학생은 연결하지 않아도 됩니다.
  python3 tools/hareport.py show --id 김민서 --password 학생비밀번호
  python3 tools/hareport.py resize-decoys --admin-password 관리비밀번호
      관리자 파일에 기록된 가짜 파일의 크기를 30KB~900KB로 다시 정합니다. 학생 파일이 커져 눈에 띌 때 실행합니다.
  python3 tools/hareport.py add-notice --title "제목" (--body "내용" | --body-file 공지.txt) [--to "B1,B2"] [--pin] [--date 2026-11-15]
      공지를 notices.json 에 넣습니다. 학생 화면 머리글의 「공지사항」에 보이고, 읽지 않은 학생에게는 버튼 옆에 숫자가 나옵니다.
      --to 를 생략하면 모든 학생이 대상입니다(레벨: A2, B1, B2, C1, GRAMMATIK, ZERTIFIKAT A2, ZERTIFIKAT B1, ZERTIFIKAT B2, ZERTIFIKAT C1 HS, SNU).
      --pin 은 중요 공지(맨 위 고정, 30일이 지나도 아직 열어 보지 않은 학생에게 새 공지로 셈)입니다.
      notices.json 은 공개 파일입니다. 학생 이름이나 연락처는 쓰지 않습니다. 커밋하고 푸시해야 학생 화면에 나타납니다.
  python3 tools/hareport.py edit-notice --nid 공지id [--title 제목] [--body 내용 | --body-file 공지.txt] [--to "B1"] [--pin | --unpin]
      공지를 고칩니다. --to "" 는 모든 학생입니다. 학생의 읽음 표시는 그대로 둡니다.
  python3 tools/hareport.py remove-notice --nid 공지id
  python3 tools/hareport.py list-notices

레벨: 시험과 리포트는 레벨(A1, A2, B1, B2, C1, GRAMMATIK, ZERTIFIKAT A2, ZERTIFIKAT B1, ZERTIFIKAT B2, ZERTIFIKAT C1 HS, SNU)별로 저장하고, 회차 번호(n)는 레벨 안에서 셉니다. 로그인한 뒤 학생이 레벨 버튼으로 골라 봅니다.
  - exam.json 의 level 이나 add-report 의 --level 을 생략하면 학생의 기본 레벨로 저장합니다.
  - 같은 레벨에서 같은 n 을 다시 올리면 덮어씁니다. 레벨이 다르면 n 이 같아도 따로 저장합니다.

학생 파일과 가짜 파일은 이름과 크기로 구별되지 않고, 전체 파일 수는 20개 단위로 늘어납니다.
아이디 정규화: NFKC, 공백 제거, 소문자. 파일 이름: PBKDF2-SHA256(아이디, salt=ha-report-id-v1, 200000회)의 앞 10바이트(16진수 20자).
암호화: PBKDF2-HMAC-SHA256 600000회 -> AES-256-GCM. 파일 형식: salt(16) + iv(12) + 암호문. 인증 데이터는 파일 id.
"""
import argparse, hashlib, json, os, re, secrets, sys, unicodedata
from datetime import datetime, timedelta, timezone
from html import escape as hesc
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
INDEX = DATA / 'index.json'
LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'GRAMMATIK', 'ZERTIFIKAT A2', 'ZERTIFIKAT B1', 'ZERTIFIKAT B2', 'ZERTIFIKAT C1 HS', 'SNU']
VOKA_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']  # 열람 페이지 VOKA 탭의 레벨 버튼은 A1-A2(A1과 A2를 묶음), B1, B2, C1
ITER = 600000
AREAS = ['grammar', 'satz', 'vocab', 'reading', 'listening', 'writing']
Z_AREAS = ['reading', 'listening', 'writing', 'speaking']  # ZERTIFIKAT 레벨(시험 준비): 읽기, 듣기, 쓰기, 말하기. telc는 sprach(Sprachbausteine)도 쓸 수 있음

UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
LOWER = 'abcdefghijkmnopqrstuvwxyz'
DIGIT = '23456789'


def make_password(n=20):
    chars = [secrets.choice(UPPER) for _ in range(5)] + [secrets.choice(LOWER) for _ in range(5)] + [secrets.choice(DIGIT) for _ in range(5)]
    pool = UPPER + LOWER + DIGIT
    chars += [secrets.choice(pool) for _ in range(n - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return ''.join(chars)


def derive(password, salt):
    pw = unicodedata.normalize('NFKC', password.strip()).encode('utf-8')
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw)


def encrypt(obj, password, sid):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(derive(password, salt)).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), sid.encode())
    return salt + iv + ct


def decrypt(blob, password, sid):
    salt, iv, ct = blob[:16], blob[16:28], blob[28:]
    return json.loads(AESGCM(derive(password, salt)).decrypt(iv, ct, sid.encode()).decode('utf-8'))


def lv_of(x, b):
    # 레벨이 없는 옛 기록은 학생 기본 레벨로 봅니다.
    return x.get('level') or b['level']


def lv_key(x, b):
    lv = lv_of(x, b)
    return (LEVELS.index(lv) if lv in LEVELS else len(LEVELS), x['n'])


def norm_id(s):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s).strip()).lower()


def file_id(s):
    return hashlib.pbkdf2_hmac('sha256', norm_id(s).encode('utf-8'), b'ha-report-id-v1', 200000, dklen=10).hex()


def count_files():
    return len([f for f in DATA.glob('*.bin') if f.name != 'admin.bin'])


def decoy_size():
    # 리포트가 쌓이면 학생 파일이 커지므로, 가짜 파일도 30KB~900KB 사이에서 고르게 뽑습니다.
    return secrets.choice(range(30000, 900000))


def make_decoy():
    sid = secrets.token_hex(10)
    (DATA / (sid + '.bin')).write_bytes(os.urandom(decoy_size()))
    return sid


ADMIN_LOGIN = '김종훈'


def admin_sid():
    return file_id(ADMIN_LOGIN)


def today_kst():
    return datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')


def read_admin(apw):
    # 관리자 파일은 일반 학생 파일과 똑같이 data/{파일 id}.bin 이고, 아이디는 김종훈입니다.
    f = DATA / (admin_sid() + '.bin')
    if not f.exists():
        sys.exit('관리자 파일이 없습니다. init-admin 을 먼저 실행하십시오.')
    try:
        A = decrypt(f.read_bytes(), apw, admin_sid())
    except Exception:
        sys.exit('관리 비밀번호가 맞지 않습니다.')
    A.setdefault('students', [])
    A.setdefault('decoys', [])
    return A


def write_admin(obj, apw):
    # 관리자 파일도 학생 파일처럼 가짜 파일과 비슷한 크기로 저장합니다.
    (DATA / (admin_sid() + '.bin')).write_bytes(encrypt(pad_bundle(obj), apw, admin_sid()))


def pad_decoys(A):
    # 전체 파일 수를 20개 단위로 맞춥니다. 학생 수를 파일 수로 알 수 없게 하려는 것입니다.
    total = count_files()
    while total % 20 != 0:
        A['decoys'].append(make_decoy()); total += 1


def read_bundle(login_id, password):
    sid = file_id(login_id)
    f = DATA / (sid + '.bin')
    if not f.exists():
        sys.exit('아이디가 없습니다: %s' % login_id)
    try:
        return decrypt(f.read_bytes(), password, sid), sid
    except Exception:
        sys.exit('학생 비밀번호가 맞지 않습니다.')


def pad_bundle(b):
    # 내용이 적은 학생 파일은 무작위 채움(pad)으로 가짜 파일과 비슷한 크기(30KB~900KB)로 만듭니다.
    # 파일 크기만 보고 실제 학생 파일을 가려내지 못하게 하려는 것입니다. 내용이 30KB를 넘으면 채움을 뺍니다.
    real = {k: v for k, v in b.items() if k != 'pad'}
    n = len(json.dumps(real, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    if n >= 30000:
        return real
    if isinstance(b.get('pad'), str):
        return b
    want = decoy_size() - n
    real['pad'] = secrets.token_urlsafe(want * 3 // 4 + 4)[:want]
    return real


def write_bundle(bundle, sid, password):
    (DATA / (sid + '.bin')).write_bytes(encrypt(pad_bundle(bundle), password, sid))


def cmd_init(a):
    DATA.mkdir(exist_ok=True)
    if (DATA / (admin_sid() + '.bin')).exists():
        sys.exit('관리자 파일이 이미 있습니다. 관리 비밀번호를 다시 만들지 않습니다.')
    legacy = DATA / 'admin.bin'
    if legacy.exists():
        if not a.replace_legacy:
            sys.exit('옛 admin.bin(가짜 파일 목록)이 있습니다. 새 관리자 체계로 바꾸려면 --replace-legacy 를 붙이십시오.')
        legacy.unlink()
    apw = a.password or make_password()
    A = {'role': 'admin', 'name': ADMIN_LOGIN, 'level': '-', 'exams': [], 'reports': [], 'voka': [], 'students': [], 'decoys': []}
    write_admin(A, apw)
    pad_decoys(A)
    write_admin(A, apw)
    print('관리 아이디: %s\n관리 비밀번호: %s' % (ADMIN_LOGIN, apw))


def cmd_pad_students(a):
    A = read_admin(a.admin_password)
    n = 0
    for s in A['students']:
        if not s.get('password'):
            continue
        f = DATA / (s['fid'] + '.bin')
        if not f.exists():
            continue
        try:
            b = decrypt(f.read_bytes(), s['password'], s['fid'])
        except Exception:
            continue
        if pad_bundle(b) == b:
            continue
        write_bundle(b, s['fid'], s['password'])
        n += 1
    write_admin(A, a.admin_password)
    print('학생 파일 %d개와 관리자 파일의 크기를 가짜 파일과 비슷하게 맞췄습니다.' % n)


def cmd_resize_decoys(a):
    A = read_admin(a.admin_password)
    for d in A['decoys']:
        f = DATA / (d + '.bin')
        if f.exists():
            f.write_bytes(os.urandom(decoy_size()))
    print('가짜 파일 %d개의 크기를 다시 정했습니다.' % len(A['decoys']))


def cmd_new(a):
    if a.level not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    A = read_admin(a.admin_password)
    login = a.id or a.name
    sid = file_id(login)
    exists = (DATA / (sid + '.bin')).exists()
    reuse = exists and sid in A['decoys']  # 삭제한 학생의 파일 자리는 가짜 파일로 남아 있으므로 다시 쓸 수 있습니다.
    if exists and not reuse:
        sys.exit('이미 있는 아이디입니다. 같은 이름이면 --id 로 다른 아이디를 주십시오.')
    if reuse:
        A['decoys'].remove(sid)
    elif A['decoys']:
        d = A['decoys'].pop()
        f = DATA / (d + '.bin')
        if f.exists():
            f.unlink()
    pw = a.password or make_password()
    if len(pw) != 20:
        sys.exit('비밀번호는 20자리여야 합니다.')
    bundle = {'name': a.name, 'level': a.level, 'exams': [], 'reports': [], 'voka': []}
    if a.grammatik or a.level == 'GRAMMATIK':
        bundle['grammatik'] = []
    write_bundle(bundle, sid, pw)
    A['students'].append({'id': login, 'fid': sid, 'name': a.name, 'level': a.level, 'password': pw, 'added': today_kst()})
    pad_decoys(A)
    write_admin(A, a.admin_password)
    print('이름: %s\n레벨: %s\n아이디: %s\n비밀번호: %s' % (a.name, a.level, norm_id(login), pw))


def cmd_link(a):
    # 이미 있는 학생을 관리자 명단에 넣습니다. 비밀번호를 모르면 --no-password 로 넣고, 관리자 페이지에서 나중에 입력합니다.
    A = read_admin(a.admin_password)
    sid = file_id(a.id)
    if not (DATA / (sid + '.bin')).exists():
        sys.exit('아이디가 없습니다: %s' % a.id)
    if a.password:
        b, _ = read_bundle(a.id, a.password)
        e = {'id': a.id, 'fid': sid, 'name': b['name'], 'level': b['level'], 'password': a.password, 'added': today_kst()}
    elif a.no_password:
        e = {'id': a.id, 'fid': sid, 'name': a.id, 'level': '-', 'password': None, 'added': today_kst()}
    else:
        sys.exit('--password 또는 --no-password 중 하나가 필요합니다.')
    old = next((s for s in A['students'] if s['fid'] == sid), None)
    if old:
        e['added'] = old.get('added') or e['added']
        A['students'][A['students'].index(old)] = e
    else:
        A['students'].append(e)
    write_admin(A, a.admin_password)
    print('명단에 반영: %s (%s)' % (e['name'], '비밀번호 있음' if e['password'] else '비밀번호 필요'))


def cmd_remove(a):
    # 학생을 뺍니다. 학생 파일은 무작위 바이트로 덮어써서 가짜 파일로 바뀌고, 파일 수는 그대로입니다.
    A = read_admin(a.admin_password)
    sid = file_id(a.id)
    e = next((s for s in A['students'] if s['fid'] == sid), None)
    if not e:
        sys.exit('명단에 없는 아이디입니다. list-students 로 확인하십시오.')
    f = DATA / (sid + '.bin')
    if f.exists():
        f.write_bytes(os.urandom(decoy_size()))
        A['decoys'].append(sid)
    A['students'].remove(e)
    write_admin(A, a.admin_password)
    print('뺐습니다: %s. 이 학생은 더 이상 로그인할 수 없습니다.' % e['name'])


def cmd_set_token(a):
    A = read_admin(a.admin_password)
    if a.clear:
        A.pop('token', None)
        write_admin(A, a.admin_password)
        print('관리자 파일에서 토큰을 지웠습니다.')
        return
    if not a.token or len(a.token) < 20:
        sys.exit('토큰을 --token 으로 주십시오.')
    A['token'] = a.token.strip()
    write_admin(A, a.admin_password)
    print('토큰을 관리자 파일(관리 비밀번호로 암호화)에 저장했습니다.')


def cmd_list(a):
    A = read_admin(a.admin_password)
    for s in A['students']:
        print('%s\t%s\t%s\t%s\t%s' % (s['name'], s['id'], s['level'], s.get('added', ''), (s['password'] if a.show_passwords else ('있음' if s['password'] else '없음'))))
    print('학생 %d명, 가짜 파일 %d개 기록, 전체 파일 %d개' % (len(A['students']), len(A['decoys']), count_files()))


def cmd_exam(a):
    b, sid = read_bundle(a.id, a.password)
    ex = json.loads(Path(a.json).read_text(encoding='utf-8'))
    ex['level'] = ex.get('level') or b['level']
    for k in (Z_AREAS if ex['level'].startswith('ZERTIFIKAT') else AREAS):
        if k not in ex.get('scores', {}):
            sys.exit('scores에 %s가 없습니다. (측정하지 않은 영역은 null로 씁니다.)' % k)
    if ex['level'] not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    b['exams'] = [e for e in b['exams'] if not (lv_of(e, b) == ex['level'] and e['n'] == ex['n'])] + [ex]
    b['exams'].sort(key=lambda e: lv_key(e, b))
    write_bundle(b, sid, a.password)
    print('시험 기록 저장: %s %s회차, 전체 %d회' % (ex['level'], ex['n'], len(b['exams'])))


def cmd_report(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    lv = a.level or b['level']
    if lv not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    r = {'n': a.exam_n, 'level': lv, 'title': a.title, 'date': a.date, 'html': html}
    b['reports'] = [x for x in b['reports'] if not (lv_of(x, b) == lv and x['n'] == a.exam_n)] + [r]
    b['reports'].sort(key=lambda x: lv_key(x, b))
    write_bundle(b, sid, a.password)
    print('리포트 저장: %s %s회차, %d자, 전체 %d개' % (lv, a.exam_n, len(html), len(b['reports'])))


def cmd_voka(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    lv = a.level or b['level']
    if lv not in VOKA_LEVELS:
        sys.exit('VOKA 레벨은 %s 중 하나입니다. --level 로 지정하십시오.' % ', '.join(VOKA_LEVELS))
    v = {'n': a.week, 'level': lv, 'title': a.title, 'date': a.date, 'html': html}
    b['voka'] = [x for x in b.get('voka', []) if not (lv_of(x, b) == lv and x['n'] == a.week)] + [v]
    b['voka'].sort(key=lambda x: (x['n'], x['date']))
    write_bundle(b, sid, a.password)
    print('VOKA 리포트 저장: %s %s주차, %d자, 전체 %d개' % (lv, a.week, len(html), len(b['voka'])))


def cmd_enroll_grammatik(a):
    b, sid = read_bundle(a.id, a.password)
    if 'grammatik' in b:
        print('이미 GRAMMATIK 탭 대상입니다. 리포트 %d개' % len(b['grammatik']))
        return
    b['grammatik'] = []
    write_bundle(b, sid, a.password)
    print('GRAMMATIK 탭을 켰습니다. 리포트 0개')


def cmd_grammatik(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    g = {'n': a.n, 'title': a.title, 'date': a.date, 'html': html}
    prev = next((x for x in b.get('grammatik', []) if x['n'] == a.n), None)
    rate = a.rate if a.rate is not None else (prev or {}).get('rate')
    if rate is not None:
        if not 0 <= rate <= 100:
            sys.exit('--rate 는 0~100 사이의 정답률(%)이어야 합니다.')
        g['rate'] = rate
    b['grammatik'] = [x for x in b.get('grammatik', []) if x['n'] != a.n] + [g]
    b['grammatik'].sort(key=lambda x: (x['n'], x['date']))
    write_bundle(b, sid, a.password)
    print('GRAMMATIK 리포트 저장: %s번, %d자, 정답률 %s, 전체 %d개' % (a.n, len(html), ('%s%%' % rate) if rate is not None else '없음', len(b['grammatik'])))


RES_RE = re.compile(r'<script[^>]*id="soda-result-data"[^>]*>(.*?)</script>', re.S)
RES_SHORT = {'telc Deutsch B2': 'telc B2', 'telc Deutsch B1': 'telc B1', 'Goethe-Zertifikat A2': 'Goethe A2',
             'Goethe-Zertifikat B1': 'Goethe B1', 'Goethe-Zertifikat B2': 'Goethe B2'}


def result_info(html):
    """SODA SPRECHEN 결과 파일에 들어 있는 JSON에서 시험 종류, 제목, 작성일, 작성 시각을 읽습니다. 없으면 빈 값입니다."""
    m = RES_RE.search(html)
    if not m:
        return {}
    try:
        p = json.loads(m.group(1))
    except ValueError:
        return {}
    if p.get('kind') != 'soda-sprechen-result':
        return {}
    labels = [e.get('label', '') for e in p.get('exams', [])]
    shorts = []
    for lb in labels:
        base = lb.split(',')[0].strip()
        sh = RES_SHORT.get(base, base)
        if sh not in shorts:
            shorts.append(sh)
    exam = shorts[0] if len(shorts) == 1 else '말하기 종합'
    if len(shorts) == 1:
        title = '말하기 ' + ' · '.join(lb.split(',', 1)[-1].strip() for lb in labels)
    else:
        title = '말하기 ' + ' · '.join(RES_SHORT.get(lb.split(',')[0].strip(), lb.split(',')[0].strip()) + ' ' + lb.split(',', 1)[-1].strip() for lb in labels) if labels else None
    date = None
    if p.get('created'):
        try:
            dt = datetime.fromisoformat(p['created'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=9)))
            date = dt.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return {'exam': exam, 'title': title, 'date': date, 'created': p.get('created')}


def cmd_result(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    info = result_info(html)
    exam = a.exam or info.get('exam')
    title = a.title or info.get('title')
    date = a.date or info.get('date') or today_kst()
    if not exam:
        sys.exit('시험 종류를 알 수 없습니다. --exam "telc B2" 처럼 지정하십시오.')
    if not title:
        sys.exit('제목을 알 수 없습니다. --title 로 지정하십시오.')
    res = b.get('results', [])
    prev = next((x for x in res if info.get('created') and x.get('created') == info['created']), None)
    n = prev['n'] if prev else max([x['n'] for x in res] + [0]) + 1
    r = {'n': n, 'exam': exam, 'title': title, 'date': date, 'html': html}
    if info.get('created'):
        r['created'] = info['created']
    b['results'] = [x for x in res if x['n'] != n] + [r]
    b['results'].sort(key=lambda x: (x['date'], x['n']))
    write_bundle(b, sid, a.password)
    print('시험 준비 저장: %s · %s · %s, %d자, 전체 %d개%s' % (exam, title, date, len(html), len(b['results']), ' (덮어씀)' if prev else ''))


TRAINING_KINDS = {
    'Lesetraining': ['lesetraining', '독해훈련', '독해 훈련'],
    'Hörtraining': ['hörtraining', 'hoertraining', 'hoeertraining', '듣기훈련', '듣기 훈련'],
    'Sprechtraining': ['sprechtraining', '말하기훈련', '말하기 훈련'],
    'Schreibtraining': ['schreibtraining', '쓰기훈련', '쓰기 훈련'],
}


def training_kind(text):
    """훈련 종류 이름이나 기록 파일의 앞부분 글에서 표준 종류 이름(Lesetraining 등)을 찾습니다. 없으면 None입니다."""
    t = unicodedata.normalize('NFKC', text or '').lower()
    for kind, names in TRAINING_KINDS.items():
        if any(n in t for n in names):
            return kind
    return None


# ---- TRAINING 리포트 이름 ----
# 목록 이름은 훈련 종류와 관계없이 '레벨 Set 번호' 형식입니다.
#   Hörtraining: 앱의 세트 이름 그대로(B2 Set 01). 세트의 지문(Teil) 하나만 올리면 'B1 Set 01 · Teil 2'.
#   Schreibtraining: 앱의 챕터 번호를 세트 번호로 씁니다(챕터 B1 01 → B1 Set 01). --title 에는 B1 01 또는 B1 Set 01을 줍니다.
#   Lesetraining: 리포트 하나를 세트 하나로 보고, 레벨마다 회차 순서로 01부터 셉니다(B2 Set 03).
#     add-training --title 에는 그 리포트가 다룬 텍스트 번호(B2 05, 두 개면 B2 01 · 02)를 주고, 세트 이름은 도구가 붙입니다.
#     텍스트 번호는 기록의 texts 에 남기고, 세트 번호와 다르면 「지금까지의 기록」 줄에 괄호로 붙입니다(B2 Set 02 (B2 03)).
# add-training 과 fix-training 은 리포트 안의 이름도 기록에 맞춥니다: 문서 제목(<title>), 제목(h1)의 회차,
# 머리말(.who)의 이름과 세트, 「지금까지의 기록」(.hist) 줄의 세트 이름. 다른 학생 리포트를 본떠 만들어
# 문서 제목에 다른 학생 이름이 남는 일도 이것으로 막습니다.
TR_LV = r'(A1|A2|B1|B2|C1)'


def tr_set_name(s):
    """'b1 set 1 teil 2' 같은 글을 세트 이름('B1 Set 01 · Teil 2')으로 맞춥니다. 세트 이름이 아니면 None입니다."""
    m = re.match(r'^' + TR_LV + r'\s*SET\s*(\d{1,2})(?:\s*·?\s*TEIL\s*(\d))?$', unicodedata.normalize('NFKC', s or '').strip().upper())
    if not m:
        return None
    return '%s Set %02d' % (m.group(1), int(m.group(2))) + (' · Teil %s' % m.group(3) if m.group(3) else '')


def sr_set_name(s):
    """Schreibtraining 챕터 번호('B1 01')나 세트 이름('b1 set 1')을 세트 이름('B1 Set 01')으로 맞춥니다. 아니면 None입니다."""
    t = tr_texts(s)
    if t and ' · ' not in t:
        return t.replace(' ', ' Set ', 1)
    n = tr_set_name(s)
    return n if n and 'Teil' not in n else None


def tr_texts(s):
    """Lesetraining 텍스트 번호('b2 1, 2' 등)를 'B2 01 · 02'로 맞춥니다. 텍스트 번호가 아니면 None입니다."""
    m = re.match(r'^' + TR_LV + r'\s*(\d{1,2}(?:\s*[·,/]\s*\d{1,2})*)$', unicodedata.normalize('NFKC', s or '').strip().upper())
    if not m:
        return None
    return '%s %s' % (m.group(1), ' · '.join('%02d' % int(x) for x in re.split(r'\s*[·,/]\s*', m.group(2))))


def tr_level(t):
    for s in (t.get('texts'), t.get('title')):
        m = re.match(TR_LV, s or '')
        if m:
            return m.group(1)
    return None


def tr_hist_rows(h):
    """리포트의 「지금까지의 기록」 줄을 (회차, 이름) 목록으로 돌려줍니다."""
    rows = []
    for blk in re.findall(r'<ul class="hist">.*?</ul>', h, re.S):
        rows += [(int(k), s) for k, s in re.findall(r'<li><span><b>(\d+)회</b> (.*?) · \d{1,2}월 \d{1,2}일', blk)]
    return rows


def training_names(tr):
    """{(훈련 종류, 회차): (목록 이름, 「지금까지의 기록」 줄에 쓰는 이름)}"""
    names, cnt = {}, {}
    for t in sorted(tr, key=lambda x: (x['kind'], x['n'])):
        title = label = t['title']
        if t['kind'] == 'Schreibtraining':
            title = label = sr_set_name(t['title']) or t['title']
        if t['kind'] == 'Lesetraining':
            lv = tr_level(t)
            if lv:
                cnt[lv] = cnt.get(lv, 0) + 1
                title = label = '%s Set %02d' % (lv, cnt[lv])
                tx = t.get('texts')
                if tx and tx != '%s %02d' % (lv, cnt[lv]):
                    label = '%s (%s)' % (title, tx)
        names[(t['kind'], t['n'])] = (title, label)
    return names


def fix_training_html(h, name, kind, n, names):
    """리포트 안의 문서 제목, 제목 회차, 머리말, 「지금까지의 기록」 줄을 기록에 맞춥니다. (새 html, 바꾼 곳, 확인할 것)"""
    title = names[(kind, n)][0]
    done, warn = [], []
    want = '<title>%s %s 첨삭 %d회 %s</title>' % (hesc(name), kind, n, hesc(title))
    h2, c = re.subn(r'<title>.*?</title>', lambda m: want, h, count=1, flags=re.S)
    if not c:
        warn.append('문서 제목(<title>)이 없습니다')
    elif h2 != h:
        done.append('문서 제목')
    h = h2
    h2, c = re.subn(r'(<h1[^>]*>[^<]*학습 기록 첨삭 · )(\d+)(회</h1>)', lambda m: m.group(1) + str(n) + m.group(3), h, count=1)
    if not c:
        warn.append('제목(h1)에서 회차를 찾지 못했습니다')
    elif h2 != h:
        done.append('제목 회차')
    h = h2
    h2, c = re.subn(r'(<p class="who"><b>)(.*?)(</b> · )(.*?)( · \d{4}년 \d{1,2}월 \d{1,2}일)',
                    lambda m: m.group(1) + hesc(name) + m.group(3) + hesc(title) + m.group(5), h, count=1, flags=re.S)
    if not c:
        warn.append('머리말(.who)에서 「이름 · 세트 · 날짜」를 찾지 못했습니다')
    elif h2 != h:
        done.append('머리말')
    h = h2

    def row(m):
        k = int(m.group(2))
        if (kind, k) not in names:
            warn.append('「지금까지의 기록」의 %d회는 학생 파일에 없는 회차입니다' % k)
            return m.group(0)
        return m.group(1) + m.group(2) + m.group(3) + hesc(names[(kind, k)][1]) + m.group(5)

    h2 = re.sub(r'<ul class="hist">.*?</ul>',
                lambda b: re.sub(r'(<li><span><b>)(\d+)(회</b> )(.*?)( · \d{1,2}월 \d{1,2}일)', row, b.group(0)), h, flags=re.S)
    if h2 != h:
        done.append('지금까지의 기록')
    return h2, done, warn


def normalize_training(b):
    """학생 파일의 TRAINING 기록과 리포트 안 이름을 모두 맞춥니다. [(종류, 회차, 이름, 바꾼 것, 확인할 것)]을 돌려줍니다."""
    tr = b.get('training') or []
    # 텍스트 번호(texts): 제목이 텍스트 번호이면 옮기고, 이미 세트 이름이면 「지금까지의 기록」 줄의 괄호에서 찾습니다.
    rec = {}
    for t in tr:
        if t['kind'] == 'Lesetraining':
            for k, s in tr_hist_rows(t['html']):
                m = re.match(r'^(.+?) \((.+)\)$', s)
                if m and tr_set_name(m.group(1)) and tr_texts(m.group(2)):
                    rec[(k, tr_set_name(m.group(1)))] = tr_texts(m.group(2))
    added = {}
    for t in tr:
        if t['kind'] == 'Lesetraining' and not t.get('texts'):
            tx = tr_texts(t['title']) or rec.get((t['n'], t['title']))
            if tx:
                t['texts'] = added[(t['kind'], t['n'])] = tx
    names = training_names(tr)
    log = []
    for t in sorted(tr, key=lambda x: (x['kind'], x['n'])):
        key = (t['kind'], t['n'])
        title = names[key][0]
        ch = []
        if t['title'] != title:
            ch.append('목록 이름 %s → %s' % (t['title'], title))
            t['title'] = title
        if key in added:
            ch.append('텍스트 번호 %s 기록' % added[key])
        h, done, warn = fix_training_html(t['html'], b['name'], t['kind'], t['n'], names)
        if h != t['html']:
            t['html'] = h
            ch += done
        log.append((t['kind'], t['n'], title, ch, warn))
    return log


def print_training_log(log, everything=False):
    for kind, n, title, ch, warn in log:
        if ch or warn or everything:
            print('  %s %d회 %s: %s' % (kind, n, title, ', '.join(ch) if ch else '그대로'))
            for w in warn:
                print('    확인 필요: %s' % w)


def cmd_training(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    kind = None
    if a.kind:
        kind = training_kind(a.kind) or a.kind.strip()
    elif a.source:
        kind = training_kind(Path(a.source).read_text(encoding='utf-8')[:600])
    if not kind:
        sys.exit('훈련 종류를 알 수 없습니다. --kind Lesetraining 처럼 주거나, 앱 이름이 적힌 기록 파일을 --source 로 주십시오.')
    tr = b.get('training', [])
    n = a.n or max([x['n'] for x in tr if x['kind'] == kind] + [0]) + 1
    date = a.date or today_kst()
    prev = next((x for x in tr if x['kind'] == kind and x['n'] == n), None)
    title, texts = a.title.strip(), None
    if kind == 'Hörtraining':
        title = tr_set_name(title)
        if not title:
            sys.exit('Hörtraining --title 은 앱의 세트 이름으로 씁니다. 예: B2 Set 01. 세트의 지문(Teil) 하나만 올리면 B1 Set 01 · Teil 2')
    elif kind == 'Schreibtraining':
        title = sr_set_name(title)
        if not title:
            sys.exit('Schreibtraining --title 은 앱의 챕터 번호(B1 01)나 세트 이름(B1 Set 01)으로 씁니다. 목록에는 B1 Set 01로 보입니다.')
    elif kind == 'Lesetraining':
        texts = tr_texts(title)
        if texts:
            title = texts
        elif tr_set_name(title) and prev:
            title, texts = tr_set_name(title), prev.get('texts')  # 이미 올린 회차를 세트 이름으로 다시 올릴 때
        else:
            sys.exit('Lesetraining --title 에는 리포트가 다룬 텍스트 번호를 줍니다. 예: B2 05, 텍스트 두 개면 B2 01 · 02. 세트 이름(B2 Set 03)은 도구가 붙입니다.')
    t = {'n': n, 'kind': kind, 'title': title, 'date': date, 'html': html}
    if texts:
        t['texts'] = texts
    if a.rate is not None:
        if not 0 <= a.rate <= 100:
            sys.exit('--rate 는 0~100 사이의 정답률(%%)입니다.')
        t['rate'] = round(a.rate)
    b['training'] = [x for x in tr if not (x['kind'] == kind and x['n'] == n)] + [t]
    log = normalize_training(b)
    b['training'].sort(key=lambda x: (x['kind'], x['date'], x['n']))
    write_bundle(b, sid, a.password)
    print('TRAINING 저장: %s %d회 · %s%s · %s, %d자, 전체 %d개%s' % (kind, n, t['title'], (' (텍스트 %s)' % texts) if texts else '', date,
                                                       len(t['html']), len(b['training']), ' (덮어씀)' if prev else ''))
    print_training_log([x for x in log if (x[0], x[1]) != (kind, n)])
    for w in next(x for x in log if (x[0], x[1]) == (kind, n))[4]:
        print('  확인 필요: %s' % w)


def cmd_fix_training(a):
    b, sid = read_bundle(a.id, a.password)
    if not b.get('training'):
        print('TRAINING 기록이 없습니다: %s' % b['name'])
        return
    log = normalize_training(b)
    print_training_log(log, everything=True)
    changed = [x for x in log if x[3]]
    if not changed:
        print('바꿀 것이 없습니다: %s' % b['name'])
        return
    if a.dry_run:
        print('--dry-run: 저장하지 않았습니다. 바뀔 기록 %d개: %s' % (len(changed), b['name']))
        return
    b['training'].sort(key=lambda x: (x['kind'], x['date'], x['n']))
    write_bundle(b, sid, a.password)
    print('TRAINING 이름 정리 저장: %s, 바뀐 기록 %d개' % (b['name'], len(changed)))


def cmd_prior(a):
    # 학습 포탈에 올리기 전에 낸 정규 과정 과제 수. 학생 화면의 레벨 도달 예상(achieve.js)이 그 레벨의 과제 점수에 더합니다.
    b, sid = read_bundle(a.id, a.password)
    if a.level not in ('A2', 'B1', 'B2'):
        sys.exit('--level 은 A2, B1, B2 중 하나입니다.')
    pr = b.get('prior') if isinstance(b.get('prior'), dict) else {}
    if a.clear:
        pr.pop(a.level, None)
    else:
        if a.count is None or a.count < 0:
            sys.exit('--count 에 학습 포탈에 올리기 전에 낸 과제 수를 0 이상의 정수로 씁니다.')
        e = {'n': a.count}
        if a.score is not None:
            if not 0 <= a.score <= 100:
                sys.exit('--score 는 0~100 사이의 평균 점수(%)입니다.')
            e['score'] = a.score
        pr[a.level] = e
    if pr:
        b['prior'] = pr
    else:
        b.pop('prior', None)
    write_bundle(b, sid, a.password)
    print('이전 과제 수 저장: %s' % (', '.join('%s %d회%s' % (k, v['n'], (' (평균 %s%%)' % v['score']) if 'score' in v else '') for k, v in sorted(pr.items())) or '없음'))


def cmd_sprechen(a):
    # 말하기 연습(SODA Sprechen) 계정을 학생 파일에 넣습니다. 학습 포탈(index.html)이 로그인할 때 이 값을 읽어 말하기 연습에 넘깁니다.
    b, sid = read_bundle(a.id, a.password)
    if a.clear:
        b.pop('sprechen', None)
        write_bundle(b, sid, a.password)
        print('말하기 계정 연결을 지웠습니다: %s' % b['name'])
        return
    if not a.sp_password:
        sys.exit('--sp-password 에 말하기 계정의 비밀번호를 주십시오. 연결을 지우려면 --clear 를 씁니다.')
    b['sprechen'] = {'id': (a.sp_id or a.id).strip(), 'pw': a.sp_password}
    write_bundle(b, sid, a.password)
    print('말하기 계정 연결: %s → 말하기 아이디 %s' % (b['name'], b['sprechen']['id']))


def cmd_show(a):
    b, sid = read_bundle(a.id, a.password)
    if isinstance(b.get('sprechen'), dict) and b['sprechen'].get('pw'):
        b['sprechen'] = dict(b['sprechen'], pw='(%d자)' % len(b['sprechen']['pw']))
    for r in b['reports'] + b.get('voka', []) + b.get('grammatik', []) + b.get('results', []) + b.get('training', []):
        r['html'] = '(%d자)' % len(r['html'])
    print(json.dumps(b, ensure_ascii=False, indent=1))


NOTICES = ROOT / 'notices.json'
NOTICE_TO = ['A2', 'B1', 'B2', 'C1', 'GRAMMATIK', 'ZERTIFIKAT A2', 'ZERTIFIKAT B1', 'ZERTIFIKAT B2', 'ZERTIFIKAT C1 HS', 'SNU']  # 관리자 화면의 레벨·반 목록과 같은 순서


def read_notices():
    if not NOTICES.exists():
        return []
    j = json.loads(NOTICES.read_text(encoding='utf-8'))
    return list(j.get('notices', [])) if isinstance(j, dict) else list(j)


def write_notices(lst):
    # 학생 화면과 같은 순서로 저장합니다: 중요 공지가 먼저, 그다음 올린 날짜가 늦은 순서.
    lst.sort(key=lambda n: (n.get('date', ''), n.get('id', '')), reverse=True)
    lst.sort(key=lambda n: 0 if n.get('pin') else 1)
    NOTICES.write_text(json.dumps({'v': 1, 'notices': lst}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


def notice_to(s):
    got = []
    for x in re.split(r'[,/]', s or ''):
        x = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', x)).strip().upper()
        if not x or x in ('ALL', '전체'):
            continue
        if x not in NOTICE_TO:
            sys.exit('대상은 %s 중에서 쉼표로 구분해 씁니다. 모든 학생이면 --to 를 생략합니다.' % ', '.join(NOTICE_TO))
        got.append(x)
    return [x for x in NOTICE_TO if x in got]


def notice_body(a):
    t = Path(a.body_file).read_text(encoding='utf-8') if a.body_file else a.body
    if t is None:
        return None
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    return '\n'.join(line.rstrip() for line in t.split('\n')).strip()


def notice_title(t):
    return re.sub(r'\s+', ' ', t or '').strip()


def notice_id():
    # 관리자 화면과 같은 형식: n + 만든 시각(밀리초, 36진수) + 무작위 4자리
    n, s = int(datetime.now().timestamp() * 1000), ''
    while n:
        n, r = divmod(n, 36)
        s = '0123456789abcdefghijklmnopqrstuvwxyz'[r] + s
    return 'n' + s + secrets.token_hex(2)


def notice_line(n):
    return '%s\t%s\t%s\t%s%s' % (n.get('id'), n.get('date', ''), ', '.join(n.get('to') or []) or '모든 학생', n.get('title', ''), '\t[중요]' if n.get('pin') else '')


def cmd_notice_add(a):
    title, body = notice_title(a.title), notice_body(a)
    if not title or not body:
        sys.exit('--title 과 --body(또는 --body-file)에 내용을 주십시오.')
    date = a.date or today_kst()
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        sys.exit('--date 는 2026-11-15 형식입니다.')
    n = {'id': notice_id(), 'date': date, 'title': title, 'body': body}
    to = notice_to(a.to)
    if to:
        n['to'] = to
    if a.pin:
        n['pin'] = True
    lst = read_notices()
    lst.append(n)
    write_notices(lst)
    print('공지 등록:', notice_line(n))
    print('notices.json 을 커밋하고 푸시하면 학생 화면에 1~2분 뒤에 나타납니다.')


def cmd_notice_edit(a):
    lst = read_notices()
    n = next((x for x in lst if x.get('id') == a.nid), None)
    if not n:
        sys.exit('없는 공지 id입니다. list-notices 로 확인하십시오.')
    before = json.dumps(n, ensure_ascii=False, sort_keys=True)
    if a.title is not None:
        if not notice_title(a.title):
            sys.exit('--title 이 비어 있습니다.')
        n['title'] = notice_title(a.title)
    body = notice_body(a)
    if body is not None:
        if not body:
            sys.exit('--body 가 비어 있습니다.')
        n['body'] = body
    if a.to is not None:
        to = notice_to(a.to)
        if to:
            n['to'] = to
        else:
            n.pop('to', None)
    if a.pin:
        n['pin'] = True
    if a.unpin:
        n.pop('pin', None)
    if json.dumps(n, ensure_ascii=False, sort_keys=True) == before:
        print('바뀐 내용이 없습니다.')
        return
    if n.get('date') != today_kst():
        n['upd'] = today_kst()
    write_notices(lst)
    print('공지 수정:', notice_line(n))


def cmd_notice_remove(a):
    lst = read_notices()
    left = [x for x in lst if x.get('id') != a.nid]
    if len(left) == len(lst):
        sys.exit('없는 공지 id입니다. list-notices 로 확인하십시오.')
    write_notices(left)
    print('공지 삭제: %s (남은 공지 %d개)' % (a.nid, len(left)))


def cmd_notice_list(a):
    lst = read_notices()
    for n in lst:
        print(notice_line(n))
    print('공지 %d개' % len(lst))


NOTIFY_CONFIG = os.path.expanduser('~/.config/hareport/notify.json')
NOTIFY_KINDS = {'첨삭': '첨삭 리포트', 'voka': 'VOKA 리포트', 'grammatik': 'GRAMMATIK 리포트', '시험': '시험 결과', 'training': 'TRAINING 리포트'}


def cmd_notify(a):
    """학생에게 Teams 채팅 알림을 보낸다. 설정 파일은 저장소 밖(~/.config/hareport/notify.json)에 둔다."""
    import urllib.request
    try:
        cfg = json.load(open(NOTIFY_CONFIG, encoding='utf-8'))
    except FileNotFoundError:
        sys.exit('알림 설정 파일이 없습니다: ' + NOTIFY_CONFIG)
    mail = cfg.get('students', {}).get(a.id)
    if not mail:
        sys.exit('Teams 주소가 등록되지 않은 학생입니다: ' + a.id)
    label = NOTIFY_KINDS[a.kind]
    msg = cfg.get('message', '{name}님, 새 {kind}가 올라왔습니다. 로그인해서 확인하십시오.\n{url}').format(
        name=a.id, kind=label, url=cfg.get('url', ''))
    body = json.dumps({'to': mail, 'message': msg}, ensure_ascii=False).encode('utf-8')
    if a.dry_run:
        print('보낼 내용(전송 안 함):', body.decode('utf-8')); return
    repo = cfg.get('github_repo')
    if repo:
        # 비공개 알림 저장소에 이슈를 만들면 Power Automate의 GitHub 트리거가 받아 Teams로 보낸다.
        import subprocess
        def post(title, payload):
            r = subprocess.run(['gh', 'api', '-X', 'POST', 'repos/%s/issues' % repo, '-f', 'title=' + title,
                                '-f', 'body=' + payload.decode('utf-8'), '-f', 'assignees[]=' + cfg.get('github_assignee', 'SophiaDeutschAkademie')],
                               capture_output=True, text=True)
            if r.returncode:
                sys.exit('알림 이슈 생성 실패: ' + r.stderr.strip())
        post('notify ' + a.id, body)
        copy_to = cfg.get('copy_to')  # 발송 사본을 받을 관리자 Teams 주소
        if copy_to:
            note = '[발송됨] %s · %s\n%s' % (a.id, label, msg)
            post('copy ' + a.id, json.dumps({'to': copy_to, 'message': note}, ensure_ascii=False).encode('utf-8'))
        print('Teams 알림 요청 등록:', a.id, label)
        return
    req = urllib.request.Request(cfg['webhook_url'], data=body, headers={'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=30) as r:
        print('Teams 알림 전송:', a.id, label, r.status)


def main():
    p = argparse.ArgumentParser(description='SODA-LERNPORTAL(학습 포탈) 도구')
    sub = p.add_subparsers(dest='cmd', required=True)
    i = sub.add_parser('init-admin'); i.add_argument('--password'); i.add_argument('--replace-legacy', action='store_true'); i.set_defaults(f=cmd_init)
    k = sub.add_parser('link-student'); k.add_argument('--id', required=True); k.add_argument('--admin-password', required=True)
    k.add_argument('--password'); k.add_argument('--no-password', action='store_true'); k.set_defaults(f=cmd_link)
    m = sub.add_parser('remove-student'); [m.add_argument('--' + x, required=True) for x in ('id', 'admin-password')]; m.set_defaults(f=cmd_remove)
    t = sub.add_parser('set-token'); t.add_argument('--admin-password', required=True); t.add_argument('--token'); t.add_argument('--clear', action='store_true'); t.set_defaults(f=cmd_set_token)
    pd = sub.add_parser('pad-students'); pd.add_argument('--admin-password', required=True); pd.set_defaults(f=cmd_pad_students)
    l = sub.add_parser('list-students'); l.add_argument('--admin-password', required=True); l.add_argument('--show-passwords', action='store_true'); l.set_defaults(f=cmd_list)
    n = sub.add_parser('new-student'); [n.add_argument('--' + k, required=True) for k in ('name', 'level', 'admin-password')]; n.add_argument('--password')
    n.add_argument('--id'); n.add_argument('--grammatik', action='store_true'); n.set_defaults(f=cmd_new)
    e = sub.add_parser('add-exam'); [e.add_argument('--' + k, required=True) for k in ('id', 'password', 'json')]; e.set_defaults(f=cmd_exam)
    r = sub.add_parser('add-report'); [r.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    r.add_argument('--exam-n', type=int, required=True); r.add_argument('--level'); r.set_defaults(f=cmd_report)
    v = sub.add_parser('add-voka'); [v.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    v.add_argument('--week', type=int, required=True); v.add_argument('--level'); v.set_defaults(f=cmd_voka)
    q = sub.add_parser('enroll-grammatik'); [q.add_argument('--' + k, required=True) for k in ('id', 'password')]; q.set_defaults(f=cmd_enroll_grammatik)
    g = sub.add_parser('add-grammatik'); [g.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    g.add_argument('--n', type=int, required=True); g.add_argument('--rate', type=int); g.set_defaults(f=cmd_grammatik)
    w = sub.add_parser('add-result'); [w.add_argument('--' + k, required=True) for k in ('id', 'password', 'html')]
    w.add_argument('--exam'); w.add_argument('--title'); w.add_argument('--date'); w.set_defaults(f=cmd_result)
    tg = sub.add_parser('add-training'); [tg.add_argument('--' + k, required=True) for k in ('id', 'password', 'html', 'title')]
    tg.add_argument('--kind'); tg.add_argument('--source'); tg.add_argument('--n', type=int); tg.add_argument('--date'); tg.add_argument('--rate', type=float); tg.set_defaults(f=cmd_training)
    fx = sub.add_parser('fix-training'); [fx.add_argument('--' + k, required=True) for k in ('id', 'password')]
    fx.add_argument('--dry-run', action='store_true'); fx.set_defaults(f=cmd_fix_training)
    z = sub.add_parser('resize-decoys'); z.add_argument('--admin-password', required=True); z.set_defaults(f=cmd_resize_decoys)
    nt = sub.add_parser('notify'); nt.add_argument('--id', required=True); nt.add_argument('--kind', choices=list(NOTIFY_KINDS), default='첨삭'); nt.add_argument('--dry-run', action='store_true'); nt.set_defaults(f=cmd_notify)
    pr = sub.add_parser('set-prior'); [pr.add_argument('--' + k, required=True) for k in ('id', 'password', 'level')]
    pr.add_argument('--count', type=int); pr.add_argument('--score', type=int); pr.add_argument('--clear', action='store_true'); pr.set_defaults(f=cmd_prior)
    sp = sub.add_parser('set-sprechen'); [sp.add_argument('--' + k, required=True) for k in ('id', 'password')]
    sp.add_argument('--sp-id'); sp.add_argument('--sp-password'); sp.add_argument('--clear', action='store_true'); sp.set_defaults(f=cmd_sprechen)
    s = sub.add_parser('show'); [s.add_argument('--' + k, required=True) for k in ('id', 'password')]; s.set_defaults(f=cmd_show)
    na = sub.add_parser('add-notice'); na.add_argument('--title', required=True); na.add_argument('--to'); na.add_argument('--pin', action='store_true'); na.add_argument('--date')
    nb = na.add_mutually_exclusive_group(required=True); nb.add_argument('--body'); nb.add_argument('--body-file'); na.set_defaults(f=cmd_notice_add)
    ne = sub.add_parser('edit-notice'); ne.add_argument('--nid', required=True); ne.add_argument('--title'); ne.add_argument('--to')
    eb = ne.add_mutually_exclusive_group(); eb.add_argument('--body'); eb.add_argument('--body-file')
    ep = ne.add_mutually_exclusive_group(); ep.add_argument('--pin', action='store_true'); ep.add_argument('--unpin', action='store_true'); ne.set_defaults(f=cmd_notice_edit)
    nr = sub.add_parser('remove-notice'); nr.add_argument('--nid', required=True); nr.set_defaults(f=cmd_notice_remove)
    nl = sub.add_parser('list-notices'); nl.set_defaults(f=cmd_notice_list)
    a = p.parse_args(); a.f(a)


if __name__ == '__main__':
    main()

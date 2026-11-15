"""시험용 학습 포탈 학생 파일 만들기 (학습 포탈 tools/hareport.py와 같은 형식)
사용: python3 -I gen-students.py <출력 폴더(data)> <정보 json 경로>
"""
import base64, hashlib, json, os, re, sys, unicodedata
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 600000


def norm_id(s):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s).strip()).lower()


def file_id(s):
    return hashlib.pbkdf2_hmac('sha256', norm_id(s).encode('utf-8'), b'ha-report-id-v1', 200000, dklen=10).hex()


def derive(password, salt):
    pw = unicodedata.normalize('NFKC', password.strip()).encode('utf-8')
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw)


def encrypt(obj, password, sid):
    salt, iv = os.urandom(16), os.urandom(12)
    key = derive(password, salt)
    ct = AESGCM(key).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), sid.encode())
    return salt + iv + ct, key


out_dir, info_path = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
students = [
    ('테스트학생', 'Abcde23456Fghij78kLm', 'A2'),
    ('두번째학생', 'Zxcvb98765Qwert43pAs', 'B1'),
]
info = []
for name, pw, level in students:
    sid = file_id(name)
    blob, key = encrypt({'name': name, 'level': level, 'exams': [], 'reports': [], 'voka': []}, pw, sid)
    with open(os.path.join(out_dir, sid + '.bin'), 'wb') as f:
        f.write(blob)
    info.append({'name': name, 'pw': pw, 'level': level, 'sid': sid, 'k': base64.b64encode(key).decode()})
with open(info_path, 'w', encoding='utf-8') as f:
    json.dump(info, f, ensure_ascii=False, indent=1)
print('ok', [(i['name'], i['sid']) for i in info])

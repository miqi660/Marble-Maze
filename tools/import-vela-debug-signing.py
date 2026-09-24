"""将当前 Vela 默认调试证书导入本地 Android 调试密钥库，不构建应用。"""
import argparse
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--vela-project", required=True, type=Path)
args = parser.parse_args()
source = args.vela_project / "node_modules/@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature/pem"
if (args.vela_project / "sign").exists():
    raise SystemExit("工程存在自定义 sign 目录，请先核对实际 RPK 签名，不能直接导入工具链默认证书。")
cert = x509.load_pem_x509_certificate((source / "certificate.pem").read_bytes())
key = serialization.load_pem_private_key((source / "private.pem").read_bytes(), password=None)
public_format = (serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
if key.public_key().public_bytes(*public_format) != cert.public_key().public_bytes(*public_format):
    raise SystemExit("证书与私钥不匹配，未写入。")

target = Path(__file__).resolve().parents[1] / ".local-signing/vela-debug.p12"
password = b"android"  # 工具链公开调试密钥，仅用于本地互联调试。
if target.exists():
    old_key, old_cert, _ = pkcs12.load_key_and_certificates(target.read_bytes(), password)
    if (old_cert is None or old_key is None or
            old_cert.fingerprint(hashes.SHA256()) != cert.fingerprint(hashes.SHA256()) or
            old_key.public_key().public_bytes(*public_format) != cert.public_key().public_bytes(*public_format)):
        raise SystemExit("目标已存在且密钥或证书不同，未覆盖。")
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    data = pkcs12.serialize_key_and_certificates(
        b"vela-debug", key, cert, None, serialization.BestAvailableEncryption(password)
    )
    with target.open("xb") as output:
        output.write(data)

print("本地调试密钥库已就绪：", target)
print("证书 SHA-256：", cert.fingerprint(hashes.SHA256()).hex().upper())

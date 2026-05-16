import uuid
from io import BytesIO
from minio import Minio
from minio.error import S3Error

from ..config import settings


class MinioService:
    _client: Minio | None = None

    @classmethod
    def get_client(cls) -> Minio:
        if cls._client is None:
            cls._client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
        return cls._client

    @classmethod
    async def ensure_bucket(cls) -> None:
        client = cls.get_client()
        bucket = settings.MINIO_BUCKET
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{bucket}/*"],
                    }
                ],
            }
            client.set_bucket_policy(bucket, policy)
            print(f"[Minio] Bucket '{bucket}' created")

    @classmethod
    async def upload_pdf(
        cls, case_id: int, file_content: bytes, original_name: str, content_type: str = "application/pdf"
    ) -> dict:
        client = cls.get_client()
        await cls.ensure_bucket()
        bucket = settings.MINIO_BUCKET
        file_uuid = uuid.uuid4().hex
        storage_path = f"cases/{case_id}/pdfs/{file_uuid}.pdf"
        file_size = len(file_content)

        client.put_object(
            bucket_name=bucket,
            object_name=storage_path,
            data=BytesIO(file_content),
            length=file_size,
            content_type=content_type,
        )

        return {
            "storage_path": storage_path,
            "file_size": file_size,
            "original_name": original_name,
        }

    @classmethod
    async def upload_ocr_result(cls, case_id: int, document_id: int, ocr_json: dict) -> str:
        client = cls.get_client()
        await cls.ensure_bucket()
        bucket = settings.MINIO_BUCKET
        ocr_path = f"cases/{case_id}/ocr/doc_{document_id}.ocr.json"
        import json
        ocr_bytes = json.dumps(ocr_json, ensure_ascii=False).encode("utf-8")

        client.put_object(
            bucket_name=bucket,
            object_name=ocr_path,
            data=BytesIO(ocr_bytes),
            length=len(ocr_bytes),
            content_type="application/json",
        )

        return ocr_path

    @classmethod
    async def get_file(cls, storage_path: str) -> bytes:
        client = cls.get_client()
        bucket = settings.MINIO_BUCKET
        try:
            response = client.get_object(bucket, storage_path)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            raise FileNotFoundError(f"File not found: {storage_path}") from e

    @classmethod
    async def get_ocr_result(cls, ocr_result_path: str) -> dict:
        import json
        data = await cls.get_file(ocr_result_path)
        return json.loads(data.decode("utf-8"))


minio_service = MinioService()

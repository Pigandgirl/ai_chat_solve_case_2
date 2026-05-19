"""Chinese address province extraction utility."""

import re

PROVINCE_MAP = {
    "北京": "北京",
    "天津": "天津",
    "上海": "上海",
    "重庆": "重庆",
    "河北": "河北",
    "山西": "山西",
    "内蒙古": "内蒙古",
    "辽宁": "辽宁",
    "吉林": "吉林",
    "黑龙江": "黑龙江",
    "江苏": "江苏",
    "浙江": "浙江",
    "安徽": "安徽",
    "福建": "福建",
    "江西": "江西",
    "山东": "山东",
    "河南": "河南",
    "湖北": "湖北",
    "湖南": "湖南",
    "广东": "广东",
    "广西": "广西",
    "海南": "海南",
    "四川": "四川",
    "贵州": "贵州",
    "云南": "云南",
    "西藏": "西藏",
    "陕西": "陕西",
    "甘肃": "甘肃",
    "青海": "青海",
    "宁夏": "宁夏",
    "新疆": "新疆",
    "台湾": "台湾",
    "香港": "香港",
    "澳门": "澳门",
}


def extract_province(address: str) -> str | None:
    """Extract province name from a Chinese address string."""
    if not address or not isinstance(address, str):
        return None

    for key, name in PROVINCE_MAP.items():
        if key in address:
            return name

    return None


def extract_province_from_case(case: dict) -> str | None:
    """Try to extract province from a case's address fields."""
    complainant = case.get("complainant") or {}
    respondent = case.get("respondent") or {}
    project_info = case.get("project_info") or {}

    for source in [complainant, respondent, project_info]:
        if isinstance(source, dict):
            address = source.get("address") or source.get("companyAddress") or ""
            province = extract_province(str(address))
            if province:
                return province

    return None

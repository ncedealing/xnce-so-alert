# -*- coding: utf-8 -*-
"""Shared local environment checks for demo and deployment scripts."""

from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
import webbrowser
from pathlib import Path


MIN_NODE_MAJOR = 20
NODE_DOWNLOAD_URL = "https://nodejs.org/en/download"


class EnvironmentErrorWithHint(RuntimeError):
    """Environment error with an operator-friendly hint."""


def common_executable_paths(name: str) -> list[Path]:
    if is_windows_platform():
        executable_names = [name] if Path(name).suffix else [f"{name}.exe", f"{name}.cmd", f"{name}.bat"]
        candidates: list[Path] = []
        for root in [
            os.environ.get("ProgramFiles"),
            os.environ.get("ProgramFiles(x86)"),
            os.environ.get("LOCALAPPDATA"),
        ]:
            if not root:
                continue
            for executable_name in executable_names:
                candidates.extend(
                    [
                        Path(root) / "nodejs" / executable_name,
                        Path(root) / "Programs" / "nodejs" / executable_name,
                    ]
                )
        return candidates

    paths = [
        Path(f"/opt/homebrew/bin/{name}"),
        Path(f"/usr/local/bin/{name}"),
        Path(f"/usr/bin/{name}"),
    ]
    nvm_dir = os.environ.get("NVM_DIR")
    if nvm_dir:
        versions_dir = Path(nvm_dir) / "versions" / "node"
        if versions_dir.exists():
            paths.extend(sorted(versions_dir.glob(f"*/bin/{name}"), reverse=True))
    return paths


def find_executable(name: str, explicit_path: str | None = None) -> str:
    if explicit_path:
        path = Path(explicit_path).expanduser()
        if path.exists():
            return str(path)
        raise EnvironmentErrorWithHint(f"指定的 {name} 不存在: {path}")

    found = shutil.which(name)
    if found:
        return found

    for path in common_executable_paths(name):
        if path.exists():
            return str(path)

    raise EnvironmentErrorWithHint(
        "\n".join(
            missing_node_hint(name)
        )
    )


def missing_node_hint(name: str) -> list[str]:
    if is_windows_platform():
        return [
            f"未找到 {name}。",
            "脚本会在 Windows 上尝试自动启动 Node.js LTS 安装；安装完成后请重新打开 CMD/PowerShell。",
            "如果你从 IDLE/双击脚本运行仍报错，请改用 CMD/PowerShell：",
            r"  cd /d D:\爆仓提醒",
            "  py mac_local_demo.py",
            "也可以显式指定：",
            r"  py mac_local_demo.py --node C:\Program Files\nodejs\node.exe",
        ]
    return [
        f"未找到 {name}。",
        "请先安装 Node.js 20+，或在脚本参数里指定路径。",
        "推荐安装方式：",
        "  brew install node",
        "或从 https://nodejs.org 下载 LTS 版本。",
        "如果你已经安装了 Node，但从 IDLE/双击脚本运行仍报错，请改用终端运行：",
        "  cd /Users/leo/Documents/爆仓提醒",
        "  python3 mac_local_demo.py",
        "也可以显式指定：",
        "  python3 mac_local_demo.py --node /opt/homebrew/bin/node",
    ]


def is_windows_platform() -> bool:
    return platform.system().lower().startswith("win")


def start_windows_node_install() -> list[str]:
    """Start a Windows Node.js LTS installer path and return user-facing messages."""
    if not is_windows_platform():
        return []

    winget_path = shutil.which("winget")
    if winget_path:
        command = [
            winget_path,
            "install",
            "--id",
            "OpenJS.NodeJS.LTS",
            "--exact",
            "--source",
            "winget",
        ]
        try:
            subprocess.Popen(
                command,
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            )
            return [
                "已启动 Windows winget 安装窗口：Node.js LTS。",
                "请在新打开的窗口里完成安装；安装完成后重新打开 CMD/PowerShell，再运行：",
                "  py mac_local_demo.py --stop-stale",
            ]
        except OSError as error:
            return [
                f"尝试启动 winget 安装 Node.js 失败: {error}",
                f"已改为打开 Node.js 下载页: {NODE_DOWNLOAD_URL}",
                "请安装 LTS 版本，安装完成后重新打开 CMD/PowerShell。",
            ] + open_node_download_page()

    return [
        "未找到 Windows winget，已尝试打开 Node.js 下载页。",
        "请下载并安装 LTS 版本，安装完成后重新打开 CMD/PowerShell。",
    ] + open_node_download_page()


def open_node_download_page() -> list[str]:
    try:
        opened = webbrowser.open(NODE_DOWNLOAD_URL)
    except Exception as error:  # pragma: no cover - depends on local desktop shell
        return [f"打开下载页失败: {error}", f"请手动访问: {NODE_DOWNLOAD_URL}"]
    if opened:
        return [f"下载页: {NODE_DOWNLOAD_URL}"]
    return [f"无法自动打开浏览器，请手动访问: {NODE_DOWNLOAD_URL}"]


def command_output(cmd: list[str], cwd: Path | None = None) -> str:
    completed = subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)
    return completed.stdout.strip() or completed.stderr.strip()


def node_major_version(node_path: str) -> int:
    output = command_output([node_path, "--version"])
    match = re.search(r"v?(\d+)", output)
    if not match:
        raise EnvironmentErrorWithHint(f"无法识别 Node.js 版本: {output}")
    return int(match.group(1))


def ensure_node(node_path: str | None = None) -> str:
    resolved = find_executable("node", node_path)
    major = node_major_version(resolved)
    if major < MIN_NODE_MAJOR:
        raise EnvironmentErrorWithHint(
            f"当前 Node.js 版本过低: {command_output([resolved, '--version'])}，需要 Node.js {MIN_NODE_MAJOR}+。"
        )
    return resolved


def ensure_npm(npm_path: str | None = None) -> str:
    return find_executable("npm", npm_path)


def print_environment_summary(node_path: str, npm_path: str | None = None) -> None:
    print(f"Node: {node_path} ({command_output([node_path, '--version'])})")
    if npm_path:
        print(f"npm:  {npm_path} ({command_output([npm_path, '--version'])})")

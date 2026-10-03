#!/usr/bin/env python3
"""
Download and extract a verified representative subset of multispectral GeoTIFF files
from the official MSUAV500K Zenodo archive (DOI: 10.5281/zenodo.16743974 / Record 16743975).
Stores extracted files strictly inside drone/multispectral/data/.
"""

import os
import subprocess
import struct
import zlib
import sys
from pathlib import Path
import tifffile
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
MULTISPECTRAL_ROOT = SCRIPT_DIR.parent
DATA_DIR = MULTISPECTRAL_ROOT / "data"
SCRATCH_DIR = MULTISPECTRAL_ROOT / "scratch"

ZENODO_MS_URL = "https://zenodo.org/records/16743975/files/MS.zip?download=1"
CHUNK_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB stream chunk

def download_chunk():
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    chunk_file = SCRATCH_DIR / "ms_stream_chunk.bin"

    print(f"Downloading {CHUNK_SIZE_BYTES / (1024*1024):.1f} MB representative chunk from Zenodo MS.zip...")
    cmd = [
        "curl.exe",
        "-s",
        "-r", f"0-{CHUNK_SIZE_BYTES}",
        "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "-e", "https://zenodo.org/records/16743975",
        ZENODO_MS_URL,
        "-o", str(chunk_file)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"curl failed: {res.stderr}")
    
    actual_size = chunk_file.stat().st_size
    print(f"Downloaded chunk size: {actual_size:,} bytes ({actual_size / (1024*1024):.2f} MB)")
    return chunk_file

def extract_subset_tifs(chunk_file: Path):
    with open(chunk_file, "rb") as f:
        data = f.read()

    pos = 0
    extracted_files = []
    print("\nScanning and extracting complete multispectral TIFFs from chunk...")

    while pos < len(data) - 30:
        if data[pos:pos+4] == b"PK\x03\x04":
            version, flags, comp_method, mod_time, mod_date, crc32, comp_size, uncomp_size, fn_len, extra_len = struct.unpack(
                "<HHHHHIIIHH", data[pos+4:pos+30]
            )
            raw_fn = data[pos+30:pos+30+fn_len].decode("utf-8", errors="replace")
            data_start = pos + 30 + fn_len + extra_len
            data_end = data_start + comp_size

            # Check if this is a .tif file and the full compressed data is present within our chunk
            if raw_fn.lower().endswith(".tif") and comp_size > 0 and data_end <= len(data):
                comp_data = data[data_start:data_end]
                try:
                    if comp_method == 8:
                        decomp = zlib.decompress(comp_data, -15)
                    elif comp_method == 0:
                        decomp = comp_data
                    else:
                        print(f"Unsupported compression method {comp_method} for {raw_fn}")
                        pos = data_end
                        continue

                    # Clean filename (strip directory prefix if any)
                    file_name = Path(raw_fn).name
                    dest_path = DATA_DIR / file_name

                    with open(dest_path, "wb") as out_f:
                        out_f.write(decomp)

                    # Verify with tifffile
                    with tifffile.TiffFile(dest_path) as tif:
                        arr = tif.asarray()
                        extracted_files.append({
                            "filename": file_name,
                            "path": str(dest_path),
                            "file_size_bytes": len(decomp),
                            "compressed_size_bytes": comp_size,
                            "shape": list(arr.shape),
                            "dtype": str(arr.dtype),
                            "band_count": arr.shape[2] if arr.ndim == 3 else 1,
                            "min_per_band": [float(np.min(arr[:, :, c])) for c in range(arr.shape[2])],
                            "max_per_band": [float(np.max(arr[:, :, c])) for c in range(arr.shape[2])],
                            "mean_per_band": [float(np.mean(arr[:, :, c])) for c in range(arr.shape[2])],
                        })
                    print(f" Extracted: {file_name} (Shape: {arr.shape}, Dtype: {arr.dtype}, Bands: {arr.shape[2]})")
                except Exception as e:
                    print(f" Error extracting {raw_fn}: {e}")

            pos = data_end if comp_size > 0 else (pos + 30 + fn_len + extra_len)
        else:
            next_pos = data.find(b"PK\x03\x04", pos + 1)
            if next_pos == -1:
                break
            pos = next_pos

    print(f"\nSuccessfully extracted {len(extracted_files)} verified multispectral GeoTIFF files into {DATA_DIR}.")
    return extracted_files

def main():
    chunk_file = download_chunk()
    extracted = extract_subset_tifs(chunk_file)
    print(f"\nExtracted {len(extracted)} files.")

if __name__ == "__main__":
    main()

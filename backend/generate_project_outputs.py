"""Generate the optional forecast cache from the saved yield model.

Other analysis outputs are produced by their dedicated backend modules. This
script deliberately does not manufacture forecast targets, uncertainty ranges,
fertilizer plans, validation scores, or feature-importance values.
"""
from pathlib import Path

import pandas as pd

from api import _build_yield_forecast


BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "outputs"


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    rows = _build_yield_forecast()
    frame = pd.DataFrame(rows)
    destination = OUTPUT_DIR / "yield_forecast_cache.csv"
    temporary = destination.with_suffix(".csv.tmp")
    frame.to_csv(temporary, index=False)
    temporary.replace(destination)
    print(f"Saved {len(frame):,} saved-model forecast rows to {destination}")


if __name__ == "__main__":
    main()

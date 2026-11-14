"""Local plane-based slope and RMS roughness from a metric elevation grid."""

import numpy as np


def box_sum(array, size):
    radius = size // 2
    padded = np.pad(array, radius, mode='constant')
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    return integral[size:, size:] - integral[:-size, size:] - integral[size:, :-size] + integral[:-size, :-size]


def derive_features(elevation, cell_size_m, window=11):
    """Fit a local plane on odd windows; roughness = RMS plane residual in m.

    Require a complete valid window; incomplete windows return NaN features.
    Whether missing features block routing is decided by the cost policy. valid_fraction describes window coverage only,
    not the DEM's actual measurement accuracy. Input elevations must be metres.
    """
    if window < 3 or window % 2 != 1:
        raise ValueError('window must be odd and >= 3')
    if not np.isfinite(cell_size_m) or cell_size_m <= 0:
        raise ValueError('cell size must be finite and positive')
    z = np.asarray(elevation, dtype=float)
    valid = np.isfinite(z)
    if z.ndim != 2 or not valid.any():
        raise ValueError('elevation must be a 2D grid with valid values')
    count = box_sum(valid.astype(float), window)
    quality = count / (window * window)
    # Center elevations for numerical stability when squaring.
    z = np.where(valid, z - np.nanmedian(np.where(valid, z, np.nan)), 0)
    row, col = np.indices(z.shape)
    total = box_sum(z, window)
    n = window * window
    moment = window * sum(k*k for k in range(-(window//2), window//2 + 1))
    gx = (box_sum(z * col, window) - col * total) / moment
    gy = (box_sum(z * row, window) - row * total) / moment
    slope = np.degrees(np.arctan(np.hypot(gx, gy) / cell_size_m))
    variance = box_sum(z*z, window) / n - (total / n)**2
    residual = variance - (gx*gx + gy*gy) * moment / n
    roughness = np.sqrt(np.maximum(residual, 0))
    complete = count == n
    slope[~complete] = np.nan
    roughness[~complete] = np.nan
    return slope, roughness, quality


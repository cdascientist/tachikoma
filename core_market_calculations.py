#!/usr/bin/env python3
"""
core_market_calculations.py
================================================================================
PRIMARY CALCULATION ENGINE — VMQ+ Market Analysis System
================================================================================

FILE STRUCTURE:
  SECTION 0: STATIC PROJECTION CONSTANTS (UNCHANGING FACTORS)
  SECTION 1: DATA FETCHING
  SECTION 2: MOMENTUM CALCULATIONS
  SECTION 3: TREND BIAS CALCULATIONS
  SECTION 4: VOLATILITY & COMPRESSION CALCULATIONS
  SECTION 5: EXHAUSTION DETECTION CALCULATIONS
  SECTION 6: SIGNAL CLASSIFICATION CALCULATIONS
  SECTION 7: UPSS SIGNAL TAXONOMY CALCULATIONS
  SECTION 8: GBM PROJECTION CALCULATIONS
  SECTION 9: ACTIVE CHAINS DETECTION CALCULATIONS

PORTABILITY NOTES:
  - All mathematical expressions are standalone and executable
  - Modify STATIC CONSTANTS section to tune projection behavior
  - TODO markers indicate customization points
  - Each function is self-contained with clear inputs/outputs

================================================================================
"""

import os
import requests
import statistics
import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple, Optional


# =============================================================================
# SECTION 0: STATIC PROJECTION CONSTANTS (UNCHANGING FACTORS)
# =============================================================================
# These variables remain constant across all alerts and chart projections.
# They define the mathematical behavior of the calculation engine.
# 
# TODO: Modify these values to tune your projection sensitivity.
# =============================================================================

# --- Time Constants ---
MINUTES_PER_YEAR: float = 525600.0  # 365 days × 24 hours × 60 minutes
MARKET_OPEN_HOUR_EST: int = 9
MARKET_OPEN_MINUTE_EST: int = 30

# --- GBM (Geometric Brownian Motion) Constants ---
GBM_VOLATILITY_INTRADAY: float = 0.03    # 3% annualized volatility for 5-min projections
GBM_VOLATILITY_5DAY: float = 0.25        # 25% annualized volatility for 5-day projections
GBM_VOLATILITY_30DAY: float = 0.45       # 45% annualized volatility for 30-day projections
GBM_DRIFT_SCALING_FACTOR: float = 0.5    # Multiplier for momentum drift component

# --- Z-Score Constants ---
Z_SCORE_25TH_PERCENTILE: float = -0.674  # Standard normal 25th percentile
Z_SCORE_75TH_PERCENTILE: float = 0.674   # Standard normal 75th percentile
Z_SCORE_95TH_PERCENTILE: float = 1.645   # Standard normal 95th percentile
EXHAUSTION_Z_SCORE_THRESHOLD: float = 2.0  # 2σ = statistically exhausted

# --- Volatility State Thresholds ---
HIGH_VOLATILITY_CV_THRESHOLD: float = 0.03   # Coefficient of variation > 3% = expanding
LOW_VOLATILITY_CV_THRESHOLD: float = 0.01    # Coefficient of variation < 1% = compressing

# --- Signal Classification Thresholds ---
MOMENTUM_HIGH_THRESHOLD: float = 0.03
MOMENTUM_MEDIUM_THRESHOLD: float = 0.01
MOMENTUM_LOW_THRESHOLD: float = 0.005
VOLUME_HIGH_THRESHOLD: float = 1.5
VOLUME_MEDIUM_THRESHOLD: float = 1.2

# --- Projection Constants ---
INTRADAY_PROJECTION_INTERVALS: int = 18       # 18 × 5min = 90 minutes forward
INTRADAY_FLUCTUATION_DECAY: float = 0.04      # Decay factor per interval
INTRADAY_PROJECTION_CLAMP_PCT: float = 0.10   # Clamp projections to ±10% of current
SHORT_TERM_PROJECTION_DAYS: int = 5
LONG_TERM_HISTORICAL_DAYS: int = 15
LONG_TERM_PROJECTION_DAYS: int = 15

# --- UPSS Signal Strength Thresholds ---
UPSS_MOMENTUM_ALPHA_THRESHOLD: float = 0.03
UPSS_MOMENTUM_BETA_MIN: float = 0.015
UPSS_MOMENTUM_BETA_MAX: float = 0.03
UPSS_COMPRESSION_GAMMA_THRESHOLD: float = 0.4
UPSS_OMEGA_COMPRESSION_THRESHOLD: float = 0.2

# --- Chain Detection Thresholds ---
CLT_PROXIMITY_PCT_OF_STRIKE: float = 0.10     # 10% of strike price = CLT zone


# =============================================================================
# SECTION 1: DATA FETCHING ALGORITHMS
# =============================================================================
# Mathematical expressions for retrieving external market data.
# All functions return normalized dictionaries for downstream calculations.
# =============================================================================

class MarketClosedError(Exception):
    """Raised when market data is unavailable (all zeros from API)."""
    pass


def fetch_stock_quote_from_finnhub(ticker_symbol: str) -> Dict[str, Any]:
    """
    Execute: quote = API(ticker) → parse JSON → return normalized dict
    
    Variables:
        current_price = quote['c']
        session_open = quote['o']
        session_high = quote['h']
        session_low = quote['l']
        previous_close = quote['pc']
        dollar_change = current - previous
        percent_change = (dollar_change / previous) × 100
    
    Raises:
        MarketClosedError: If current_price is 0 (market closed or invalid data)
    """
    finnhub_api_key = os.environ.get("FINNHUB_API_KEY", "")
    quote_api_endpoint = f"https://finnhub.io/api/v1/quote?symbol={ticker_symbol}&token={finnhub_api_key}"
    
    http_response = requests.get(quote_api_endpoint, timeout=10)
    quote_json_payload = http_response.json()
    
    # Extract raw values from API response
    current_trading_price = quote_json_payload.get("c", 0.0)
    session_opening_price = quote_json_payload.get("o", current_trading_price)
    session_high_price = quote_json_payload.get("h", current_trading_price)
    session_low_price = quote_json_payload.get("l", current_trading_price)
    previous_session_closing_price = quote_json_payload.get("pc", current_trading_price)
    
    # Validate: if current price is 0, market is closed
    if current_trading_price == 0.0:
        raise MarketClosedError(
            f"Market data unavailable for {ticker_symbol}: current_price=0.0. "
            "Market may be closed. Use last known data."
        )
    
    # Calculate derived price metrics
    dollar_price_change = current_trading_price - previous_session_closing_price
    percentage_price_change = (
        (dollar_price_change / previous_session_closing_price) * 100 
        if previous_session_closing_price 
        else 0.0
    )
    
    return {
        "current_price": current_trading_price,
        "session_open_price": session_opening_price,
        "session_high_price": session_high_price,
        "session_low_price": session_low_price,
        "previous_session_close": previous_session_closing_price,
        "dollar_change": dollar_price_change,
        "percent_change": percentage_price_change,
    }


def fetch_fundamental_metrics_from_finnhub(ticker_symbol: str) -> Dict[str, Any]:
    """
    Execute: metrics = API(ticker) → parse JSON → return fundamentals
    """
    finnhub_api_key = os.environ.get("FINNHUB_API_KEY", "")
    metrics_api_endpoint = f"https://finnhub.io/api/v1/stock/metric?symbol={ticker_symbol}&metric=all&token={finnhub_api_key}"
    
    http_response = requests.get(metrics_api_endpoint, timeout=10)
    metrics_json_payload = http_response.json()
    metric_series = metrics_json_payload.get("metric", {})
    
    return {
        "market_cap": metric_series.get("marketCapitalization", 0),
        "pe_ratio": metric_series.get("peBasicExclExtraTTM", 0),
        "fifty_two_week_high": metric_series.get("52WeekHigh", 0),
        "fifty_two_week_low": metric_series.get("52WeekLow", 0),
    }


def fetch_historical_candles_from_finnhub(
    ticker_symbol: str,
    candle_resolution_minutes: str = "5",
    candle_lookback_days: int = 1,
) -> Dict[str, Any]:
    """
    Execute: candles = API(ticker, resolution, from, to) → return OHLCV
    
    Time calculation:
        end = now
        start = now - (lookback_days × 86400 seconds)
    """
    finnhub_api_key = os.environ.get("FINNHUB_API_KEY", "")
    
    end_timestamp_seconds = int(datetime.now(timezone.utc).timestamp())
    start_timestamp_seconds = end_timestamp_seconds - (candle_lookback_days * 86400)
    
    candles_api_endpoint = (
        f"https://finnhub.io/api/v1/stock/candle?"
        f"symbol={ticker_symbol}&"
        f"resolution={candle_resolution_minutes}&"
        f"from={start_timestamp_seconds}&"
        f"to={end_timestamp_seconds}&"
        f"token={finnhub_api_key}"
    )
    
    http_response = requests.get(candles_api_endpoint, timeout=10)
    return http_response.json()


# =============================================================================
# SECTION 2: MOMENTUM CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expression:
#     momentum = clamp((avg_delta / volatility) × 0.5, -1, 1)
# 
# Where:
#     avg_delta = mean(price[i] - price[i-1] for all i)
#     volatility = stdev(price_values) or fallback
# =============================================================================

def calculate_price_momentum_rate_of_change(
    current_market_price: float,
    historical_price_records: List[Dict[str, Any]],
) -> float:
    """
    Execute momentum formula: M = clamp((μ_Δ / σ) × 0.5, -1, 1)
    
    TODO: Adjust scaling factor 0.5 to tune momentum sensitivity
    """
    default_momentum_for_empty_history = 0.0
    
    if len(historical_price_records) < 2:
        return default_momentum_for_empty_history
    
    # Extract price values from historical records
    historical_prices_only = [
        record["price"] for record in historical_price_records 
        if record.get("price")
    ]
    
    if len(historical_prices_only) < 2:
        return default_momentum_for_empty_history
    
    # Calculate recent price deltas: ΔP[i] = P[i] - P[i-1]
    recent_price_deltas = [
        historical_prices_only[i] - historical_prices_only[i - 1]
        for i in range(1, len(historical_prices_only))
    ]
    
    # Compute average delta (mean rate of change)
    average_price_delta = sum(recent_price_deltas) / len(recent_price_deltas)
    
    # Calculate price volatility (standard deviation of deltas)
    if len(recent_price_deltas) > 1:
        price_volatility = statistics.stdev(recent_price_deltas)
    else:
        price_volatility = abs(average_price_delta) * 0.5
    
    # Avoid division by zero with minimum volatility floor
    if price_volatility == 0:
        price_volatility = 0.001
    
    # Momentum formula: normalized rate of change
    raw_momentum_score = average_price_delta / price_volatility
    normalized_momentum = max(-1.0, min(1.0, raw_momentum_score * 0.5))
    
    return round(normalized_momentum, 4)


def calculate_momentum_from_quote_data(quote_data: Dict[str, Any]) -> float:
    """
    Execute intraday momentum: M = clamp((intraday_return / 0.10), -1, 1)
    
    Where intraday_return = (current - open) / open
    
    TODO: Adjust 0.10 (10% threshold) to tune intraday sensitivity
    """
    session_opening_price = quote_data.get("session_open_price", 0)
    current_trading_price = quote_data.get("current_price", 0)
    
    if session_opening_price <= 0:
        return 0.0
    
    # Intraday percentage change as momentum proxy
    intraday_percentage_change = (
        (current_trading_price - session_opening_price) / session_opening_price
    )
    
    # Normalize: ±10% intraday move = ±1.0 momentum
    normalized_intraday_momentum = max(
        -1.0, 
        min(1.0, intraday_percentage_change / 0.10)
    )
    
    return round(normalized_intraday_momentum, 4)


# =============================================================================
# SECTION 3: TREND BIAS CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expression:
#     Count higher highs vs lower lows in recent window
#     bias = up if higher_highs > lower_lows else down if lower_lows > higher_highs else neutral
# =============================================================================

def calculate_trend_bias_direction(
    historical_price_records: List[Dict[str, Any]],
    current_market_price: float,
) -> str:
    """
    Execute trend bias formula:
        HH = count(P[i] > P[i-1])
        LL = count(P[i] < P[i-1])
        bias = up if HH > LL else down if LL > HH else neutral
    
    TODO: Adjust minimum_records threshold for trend confirmation
    """
    minimum_records_for_trend_analysis = 3
    
    if len(historical_price_records) < minimum_records_for_trend_analysis:
        return "neutral"
    
    # Extract prices from lookback window
    recent_lookback_window_size = min(10, len(historical_price_records))
    recent_price_values = [
        historical_price_records[i]["price"]
        for i in range(-recent_lookback_window_size, 0)
        if historical_price_records[i].get("price")
    ]
    
    if len(recent_price_values) < minimum_records_for_trend_analysis:
        return "neutral"
    
    # Count higher highs and lower lows
    higher_high_count = 0
    lower_low_count = 0
    
    for i in range(1, len(recent_price_values)):
        if recent_price_values[i] > recent_price_values[i - 1]:
            higher_high_count += 1
        elif recent_price_values[i] < recent_price_values[i - 1]:
            lower_low_count += 1
    
    # Count local extrema (peaks and troughs)
    local_peak_count = 0
    local_trough_count = 0
    
    for i in range(1, len(recent_price_values) - 1):
        if (recent_price_values[i] > recent_price_values[i - 1] and 
            recent_price_values[i] > recent_price_values[i + 1]):
            local_peak_count += 1
        elif (recent_price_values[i] < recent_price_values[i - 1] and 
              recent_price_values[i] < recent_price_values[i + 1]):
            local_trough_count += 1
    
    # Determine bias
    if higher_high_count > lower_low_count and local_peak_count >= local_trough_count:
        return "up"
    elif lower_low_count > higher_high_count and local_trough_count >= local_peak_count:
        return "down"
    else:
        return "neutral"


# =============================================================================
# SECTION 4: VOLATILITY & COMPRESSION CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expressions:
#     CV = σ / μ  (coefficient of variation)
#     compression = clamp(1 - (CV / high_threshold), 0, 1)
# 
# State classification:
#     expanding if CV > HIGH_VOLATILITY_CV_THRESHOLD
#     compressing if CV < LOW_VOLATILITY_CV_THRESHOLD
#     normal otherwise
# =============================================================================

def calculate_volatility_state_and_compression(
    historical_price_records: List[Dict[str, Any]],
    current_market_price: float,
) -> Tuple[str, float]:
    """
    Execute volatility formulas:
        μ = mean(prices)
        σ = stdev(prices)
        CV = σ / μ
        state = expanding if CV > 0.03 else compressing if CV < 0.01 else normal
        compression = clamp(1 - CV/0.03, 0, 1)
    
    TODO: Adjust HIGH_VOLATILITY_CV_THRESHOLD and LOW_VOLATILITY_CV_THRESHOLD
    """
    minimum_records_for_volatility = 3
    
    if len(historical_price_records) < minimum_records_for_volatility:
        return "normal", 0.5
    
    # Extract prices for volatility computation
    volatility_lookback_window = min(20, len(historical_price_records))
    recent_prices_for_volatility = [
        historical_price_records[i]["price"]
        for i in range(-volatility_lookback_window, 0)
        if historical_price_records[i].get("price")
    ]
    recent_prices_for_volatility.append(current_market_price)
    
    if len(recent_prices_for_volatility) < minimum_records_for_volatility:
        return "normal", 0.5
    
    # Calculate mean and standard deviation
    price_mean_value = sum(recent_prices_for_volatility) / len(recent_prices_for_volatility)
    
    if len(recent_prices_for_volatility) > 1:
        price_standard_deviation = statistics.stdev(recent_prices_for_volatility)
    else:
        price_standard_deviation = 0.0
    
    # Coefficient of variation (relative volatility)
    if price_mean_value > 0:
        coefficient_of_variation = price_standard_deviation / price_mean_value
    else:
        coefficient_of_variation = 0.0
    
    # Classify volatility state using STATIC CONSTANTS
    if coefficient_of_variation > HIGH_VOLATILITY_CV_THRESHOLD:
        volatility_classification = "expanding"
    elif coefficient_of_variation < LOW_VOLATILITY_CV_THRESHOLD:
        volatility_classification = "compressing"
    else:
        volatility_classification = "normal"
    
    # Compression factor: 0 = tight (coiled), 1 = wide
    raw_compression_value = 1.0 - (coefficient_of_variation / HIGH_VOLATILITY_CV_THRESHOLD)
    bounded_compression_factor = max(0.0, min(1.0, raw_compression_value))
    
    return volatility_classification, round(bounded_compression_factor, 2)


# =============================================================================
# SECTION 5: EXHAUSTION DETECTION CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expression:
#     Z = (current_price - mean_price) / std_dev
#     exhausted = True if |Z| > EXHAUSTION_Z_SCORE_THRESHOLD else False
# =============================================================================

def calculate_price_exhaustion_state(
    historical_price_records: List[Dict[str, Any]],
    current_market_price: float,
) -> Tuple[bool, float]:
    """
    Execute exhaustion formula:
        μ = mean(historical_prices)
        σ = stdev(historical_prices)
        Z = (current - μ) / σ
        exhausted = True if |Z| > 2.0 else False
    
    TODO: Adjust EXHAUSTION_Z_SCORE_THRESHOLD (default 2.0) for sensitivity
    """
    minimum_records_for_exhaustion = 5
    
    if len(historical_price_records) < minimum_records_for_exhaustion:
        return False, 0.0
    
    # Build price sample
    exhaustion_lookback_window = min(15, len(historical_price_records))
    price_sample_for_zscore = [
        historical_price_records[i]["price"]
        for i in range(-exhaustion_lookback_window, 0)
        if historical_price_records[i].get("price")
    ]
    
    if len(price_sample_for_zscore) < minimum_records_for_exhaustion:
        return False, 0.0
    
    # Compute sample statistics
    sample_mean_price = sum(price_sample_for_zscore) / len(price_sample_for_zscore)
    
    if len(price_sample_for_zscore) > 1:
        sample_standard_deviation = statistics.stdev(price_sample_for_zscore)
    else:
        sample_standard_deviation = 0.0
    
    if sample_standard_deviation == 0:
        return False, 0.0
    
    # Calculate Z-score
    price_z_score = (current_market_price - sample_mean_price) / sample_standard_deviation
    
    # Determine exhaustion
    is_price_exhausted = abs(price_z_score) > EXHAUSTION_Z_SCORE_THRESHOLD
    
    return is_price_exhausted, round(price_z_score, 2)


# =============================================================================
# SECTION 6: SIGNAL CLASSIFICATION CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expressions for classification:
#     direction = f(momentum, trend_bias, thresholds)
#     energy = f(|momentum|, volume_impulse, thresholds)
#     msg_type = f(direction, energy, volatility_state, exhaustion, hedge, scalp)
# =============================================================================

def classify_market_signal_from_all_metrics(
    momentum_value: float,
    trend_bias_direction: str,
    volatility_state_label: str,
    compression_factor_value: float,
    is_exhaustion_detected: bool,
    volume_impulse_multiplier: float,
    is_hedge_trigger_active: bool,
    is_scalp_window_viable: bool,
    scalp_direction_bias: str,
) -> Tuple[str, str, str]:
    """
    Execute classification formulas:
        
        direction = UP if (momentum > 0.02 AND trend_bias == up) OR momentum > 0.05
                  = DOWN if (momentum < -0.02 AND trend_bias == down) OR momentum < -0.05
                  = NEUTRAL otherwise
        
        energy = HIGH if |momentum| > 0.03 AND volume > 1.5
               = MEDIUM if |momentum| > 0.01 OR volume > 1.2
               = LOW otherwise
        
        msg_type = f(direction, energy, volatility, exhaustion, hedge, scalp)
    
    TODO: Adjust momentum and volume thresholds in STATIC CONSTANTS section
    """
    # --- Determine Direction ---
    if momentum_value > 0.02 and trend_bias_direction == "up":
        market_direction = "UP"
    elif momentum_value < -0.02 and trend_bias_direction == "down":
        market_direction = "DOWN"
    elif momentum_value > 0.05:
        market_direction = "UP"
    elif momentum_value < -0.05:
        market_direction = "DOWN"
    else:
        market_direction = "NEUTRAL"
    
    # --- Determine Energy Level using STATIC CONSTANTS ---
    momentum_is_high = abs(momentum_value) > MOMENTUM_HIGH_THRESHOLD
    volume_is_high = volume_impulse_multiplier > VOLUME_HIGH_THRESHOLD
    momentum_is_medium = abs(momentum_value) > MOMENTUM_MEDIUM_THRESHOLD
    volume_is_medium = volume_impulse_multiplier > VOLUME_MEDIUM_THRESHOLD
    
    if momentum_is_high and volume_is_high:
        market_energy_level = "HIGH"
    elif momentum_is_medium or volume_is_medium:
        market_energy_level = "MEDIUM"
    else:
        market_energy_level = "LOW"
    
    # --- Determine Message Type ---
    if is_exhaustion_detected:
        if momentum_value > 0:
            signal_message_type = "momentum_exhaustion"
        else:
            signal_message_type = "dip_exhaustion"
    elif is_hedge_trigger_active:
        signal_message_type = "hedge_setup"
    elif is_scalp_window_viable:
        if scalp_direction_bias == "up":
            signal_message_type = "long_scalp"
        elif scalp_direction_bias == "down":
            signal_message_type = "short_scalp"
        else:
            signal_message_type = "scalp_alert"
    elif compression_factor_value < 0.3 and volatility_state_label == "compressing":
        signal_message_type = "compression_building"
    elif market_direction == "UP" and market_energy_level == "HIGH":
        signal_message_type = "momentum_surge"
    elif market_direction == "DOWN" and market_energy_level == "HIGH":
        signal_message_type = "sell_pressure"
    elif market_direction == "UP" and market_energy_level == "MEDIUM":
        signal_message_type = "steady_climb"
    elif market_direction == "DOWN" and market_energy_level == "MEDIUM":
        signal_message_type = "gradual_decline"
    else:
        signal_message_type = "market_check"
    
    return market_direction, market_energy_level, signal_message_type


def derive_price_reference_points_for_alert(
    session_opening_price: float,
    current_trading_price: float,
    previous_session_closing_price: float,
    market_direction_label: str,
) -> Tuple[float, float, str]:
    """
    Execute reference point formulas:
        elapsed_minutes = current_time - MARKET_OPEN_HOUR_EST:MARKET_OPEN_MINUTE_EST
        price_from = session_open if direction == UP else previous_close
        price_to = current_price
    
    TODO: Adjust MARKET_OPEN_HOUR_EST and MARKET_OPEN_MINUTE_EST for timezone
    """
    # Calculate elapsed time since market open
    current_utc_time = datetime.now(timezone.utc)
    est_offset_hours = -4  # EDT (UTC-4)
    current_est_time = current_utc_time + timedelta(hours=est_offset_hours)
    
    market_open_est_time = current_est_time.replace(
        hour=MARKET_OPEN_HOUR_EST, 
        minute=MARKET_OPEN_MINUTE_EST, 
        second=0, 
        microsecond=0
    )
    
    elapsed_since_open = current_est_time - market_open_est_time
    elapsed_minutes_total = int(elapsed_since_open.total_seconds() / 60)
    
    if elapsed_minutes_total < 0:
        elapsed_minutes_total = 0
    
    elapsed_hours = elapsed_minutes_total // 60
    elapsed_minutes = elapsed_minutes_total % 60
    
    if elapsed_hours > 0:
        time_elapsed_description = f"{elapsed_hours}h {elapsed_minutes}m"
    else:
        time_elapsed_description = f"{elapsed_minutes}m"
    
    # Determine reference prices
    if market_direction_label == "UP":
        reference_starting_price = session_opening_price
    elif market_direction_label == "DOWN":
        reference_starting_price = previous_session_closing_price
    else:
        reference_starting_price = session_opening_price
    
    reference_ending_price = current_trading_price
    
    return reference_starting_price, reference_ending_price, time_elapsed_description


# =============================================================================
# SECTION 7: UPSS SIGNAL TAXONOMY CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expressions for UPSS signals:
#     alpha: momentum > UPSS_MOMENTUM_ALPHA_THRESHOLD AND trend_bias == up
#     beta: UPSS_MOMENTUM_BETA_MIN < momentum <= UPSS_MOMENTUM_BETA_MAX AND trend_bias == up
#     gamma: compression < UPSS_COMPRESSION_GAMMA_THRESHOLD AND |momentum| < 0.02
#     delta: momentum < -0.02 AND trend_bias == down OR (exhaustion AND momentum > 0.05)
#     omega+: compression < UPSS_OMEGA_COMPRESSION_THRESHOLD
#     epsilon: |momentum| < 0.01 AND not exhaustion AND not hedge
#     H: exhaustion OR hedge_trigger
#     rho: volatility == expanding AND compression > 0.5
# =============================================================================

def generate_upss_signals_from_market_conditions(
    momentum_value: float,
    trend_bias_direction: str,
    volatility_state_label: str,
    compression_factor_value: float,
    is_exhaustion_detected: bool,
    is_hedge_trigger_active: bool,
    is_scalp_window_viable: bool,
) -> List[Dict[str, Any]]:
    """
    Execute UPSS signal formulas using STATIC CONSTANTS thresholds.
    
    Signal strength formula: strength = normalized_metric_value (0-1)
    
    TODO: Adjust UPSS signal thresholds in STATIC CONSTANTS section
    """
    upss_signals_list = []
    
    # Alpha (buy shares) — strong upward momentum
    if (momentum_value > UPSS_MOMENTUM_ALPHA_THRESHOLD and 
        trend_bias_direction == "up" and 
        not is_exhaustion_detected):
        upss_signals_list.append({"sym": "alpha", "strength": momentum_value})
    
    # Beta (add to position) — moderate upward continuation
    if (UPSS_MOMENTUM_BETA_MIN < momentum_value <= UPSS_MOMENTUM_BETA_MAX and 
        trend_bias_direction == "up"):
        upss_signals_list.append({"sym": "beta", "strength": momentum_value})
    
    # Gamma (collect premium) — range-bound / compressing
    if (compression_factor_value < UPSS_COMPRESSION_GAMMA_THRESHOLD and 
        abs(momentum_value) < 0.02):
        upss_signals_list.append({"sym": "gamma", "strength": 1.0 - compression_factor_value})
    
    # Delta (sell / take profits) — downward momentum or exhaustion on up move
    if ((momentum_value < -0.02 and trend_bias_direction == "down") or 
        (is_exhaustion_detected and momentum_value > 0.05)):
        upss_signals_list.append({"sym": "delta", "strength": abs(momentum_value)})
    
    # Omega+ (speculative buy) — compression breakout imminent
    if (compression_factor_value < UPSS_OMEGA_COMPRESSION_THRESHOLD and 
        volatility_state_label == "compressing"):
        upss_signals_list.append({"sym": "omega+", "strength": 1.0 - compression_factor_value})
    
    # Epsilon (coil / wait) — neutral, no clear direction
    if (abs(momentum_value) < 0.01 and 
        not is_exhaustion_detected and 
        not is_hedge_trigger_active):
        upss_signals_list.append({"sym": "epsilon", "strength": 0.5})
    
    # H (protect / hedge) — exhaustion or hedge trigger
    if is_exhaustion_detected or is_hedge_trigger_active:
        hedge_strength = 1.0 if is_exhaustion_detected else 0.7
        upss_signals_list.append({"sym": "H", "strength": hedge_strength})
    
    # Rho (regime change) — volatility expansion after compression
    if volatility_state_label == "expanding" and compression_factor_value > 0.5:
        upss_signals_list.append({"sym": "rho", "strength": 0.8})
    
    # Sort signals by strength (descending)
    upss_signals_list.sort(key=lambda signal: signal["strength"], reverse=True)
    
    return upss_signals_list


def determine_upss_regime_from_conditions(
    momentum_value: float,
    trend_bias_direction: str,
) -> str:
    """
    Execute regime determination formula:
        FULL if momentum > 0.05 AND trend_bias == up
        EQUITY if momentum > 0.02 AND trend_bias == up
        INVERSE if momentum < -0.03 AND trend_bias == down
        REDUCED if |momentum| < 0.01
        PUT if momentum < 0 AND trend_bias == down
        HEDGED otherwise
    
    TODO: Adjust regime thresholds in STATIC CONSTANTS section
    """
    if momentum_value > 0.05 and trend_bias_direction == "up":
        return "FULL"
    elif momentum_value > 0.02 and trend_bias_direction == "up":
        return "EQUITY"
    elif momentum_value < -0.03 and trend_bias_direction == "down":
        return "INVERSE"
    elif abs(momentum_value) < 0.01:
        return "REDUCED"
    elif momentum_value < 0 and trend_bias_direction == "down":
        return "PUT"
    else:
        return "HEDGED"


# =============================================================================
# SECTION 8: GBM PROJECTION CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expressions (Geometric Brownian Motion):
#     
#     S_expected = S_0 × exp((μ - 0.5σ²) × t)
#     
#     Where:
#         S_0 = current_price
#         μ = momentum_drift_rate
#         σ = historical_volatility_estimate
#         t = time_in_years
#     
#     Percentile bands:
#         S_pXX = S_expected × exp(Z_XX × σ × √t)
#         Where Z_XX are standard normal Z-scores
# =============================================================================

def calculate_gbm_price_projection(
    current_market_price: float,
    momentum_drift_rate: float,
    projection_time_horizon_minutes: int = 5,
    historical_volatility_estimate: float = GBM_VOLATILITY_INTRADAY,
) -> Dict[str, float]:
    """
    Execute GBM projection formulas using STATIC CONSTANTS for volatility.
    
    Formula:
        drift_component = (μ - 0.5σ²) × t
        S_expected = S_0 × e^(drift_component)
        S_pXX = S_expected × e^(Z_XX × σ × √t)
    
    TODO: Adjust GBM_VOLATILITY_* constants for different time horizons
    """
    # Convert minutes to years
    time_in_years = projection_time_horizon_minutes / MINUTES_PER_YEAR
    
    # GBM parameters
    drift_rate = momentum_drift_rate
    volatility_rate = historical_volatility_estimate
    
    # Expected price: S_0 × exp((μ - 0.5σ²) × t)
    gbm_drift_component = (drift_rate - 0.5 * volatility_rate ** 2) * time_in_years
    expected_future_price = current_market_price * math.exp(gbm_drift_component)
    
    # Volatility scaling: σ × √t
    volatility_time_scaling = volatility_rate * (time_in_years ** 0.5)
    
    # Percentile bands using STATIC Z-scores
    percentile_25_price = expected_future_price * math.exp(Z_SCORE_25TH_PERCENTILE * volatility_time_scaling)
    percentile_75_price = expected_future_price * math.exp(Z_SCORE_75TH_PERCENTILE * volatility_time_scaling)
    percentile_95_price = expected_future_price * math.exp(Z_SCORE_95TH_PERCENTILE * volatility_time_scaling)
    
    return {
        "expected": round(expected_future_price, 2),
        "p25": round(percentile_25_price, 2),
        "p75": round(percentile_75_price, 2),
        "p95": round(percentile_95_price, 2),
    }


def generate_multi_horizon_gbm_projections(
    current_market_price: float,
    momentum_drift_rate: float,
) -> Dict[str, Dict[str, float]]:
    """
    Execute multi-horizon GBM projections using STATIC CONSTANTS.
    
    Time horizons:
        5-minute: volatility = GBM_VOLATILITY_INTRADAY
        5-day: volatility = GBM_VOLATILITY_5DAY
        30-day: volatility = GBM_VOLATILITY_30DAY
    
    TODO: Add additional time horizons or adjust volatility constants
    """
    all_time_horizons = {}
    
    # 5-minute projection (intraday scalp horizon)
    five_minute_projection = calculate_gbm_price_projection(
        current_market_price=current_market_price,
        momentum_drift_rate=momentum_drift_rate,
        projection_time_horizon_minutes=5,
        historical_volatility_estimate=GBM_VOLATILITY_INTRADAY,
    )
    five_minute_projection["assignment_prob"] = 3
    all_time_horizons["5m"] = five_minute_projection
    
    # 5-day projection (swing trade horizon)
    minutes_in_five_days = 5 * 24 * 60
    five_day_projection = calculate_gbm_price_projection(
        current_market_price=current_market_price,
        momentum_drift_rate=momentum_drift_rate,
        projection_time_horizon_minutes=minutes_in_five_days,
        historical_volatility_estimate=GBM_VOLATILITY_5DAY,
    )
    all_time_horizons["5d"] = five_day_projection
    
    # 30-day projection (long-term horizon)
    minutes_in_thirty_days = 30 * 24 * 60
    thirty_day_projection = calculate_gbm_price_projection(
        current_market_price=current_market_price,
        momentum_drift_rate=momentum_drift_rate,
        projection_time_horizon_minutes=minutes_in_thirty_days,
        historical_volatility_estimate=GBM_VOLATILITY_30DAY,
    )
    all_time_horizons["30d"] = thirty_day_projection
    
    return all_time_horizons


# =============================================================================
# SECTION 9: ACTIVE CHAINS DETECTION CALCULATION ALGORITHMS
# =============================================================================
# Mathematical expressions for chain detection:
#     
#     PREMIUM_STACK: gamma ∈ signals AND epsilon ∈ signals
#     ASSIGNMENT_CHAIN: omega+ ∈ signals AND alpha ∈ signals
#     CLT_APPROACH: |current - CLT| < (strike × CLT_PROXIMITY_PCT_OF_STRIKE)
#     SCALP_IMMEDIATE: scalp_viable == True
#     FULL_HEDGE: H ∈ signals AND delta ∈ signals
# 
# Confidence formula:
#     confidence = base_confidence + bonus_conditions
# =============================================================================

def detect_active_signal_chains_from_upss_data(
    upss_signals_list: List[Dict[str, Any]],
    current_market_price: float,
    option_strike_price: float,
    average_cost_basis: float,
    cumulative_liquidation_threshold_price: float,
    is_scalp_window_viable: bool,
) -> List[Dict[str, Any]]:
    """
    Execute chain detection formulas using STATIC CONSTANT thresholds.
    
    Chain confidence formula:
        confidence = base + (condition_met ? bonus : 0)
        final_confidence = min(1.0, confidence)
    
    TODO: Adjust CLT_PROXIMITY_PCT_OF_STRIKE for different assignment risk levels
    """
    detected_active_chains = []
    
    # Extract signal symbols for chain matching
    signal_symbol_sequence = [signal["sym"] for signal in upss_signals_list]
    
    # --- PREMIUM_STACK chain: gamma (collect premium) dominant ---
    if "gamma" in signal_symbol_sequence:
        premium_stack_confidence = 0.85
        if "epsilon" in signal_symbol_sequence:
            premium_stack_confidence += 0.10
        
        detected_active_chains.append({
            "id": "PREMIUM_STACK",
            "signals": ["gamma", "epsilon", "gamma"],
            "prox": min(1.0, premium_stack_confidence),
        })
    
    # --- ASSIGNMENT_CHAIN: omega+ → alpha → beta ---
    if "omega+" in signal_symbol_sequence and "alpha" in signal_symbol_sequence:
        assignment_confidence = 0.75
        if "beta" in signal_symbol_sequence:
            assignment_confidence += 0.15
        
        detected_active_chains.append({
            "id": "ASSIGNMENT_CHAIN",
            "signals": ["omega+", "alpha", "beta"],
            "prox": min(1.0, assignment_confidence),
        })
    
    # --- CLT_APPROACH: price approaching cumulative liquidation threshold ---
    if cumulative_liquidation_threshold_price > 0:
        distance_to_clt = abs(current_market_price - cumulative_liquidation_threshold_price)
        clt_threshold_distance = option_strike_price * CLT_PROXIMITY_PCT_OF_STRIKE
        
        if distance_to_clt < clt_threshold_distance:
            clt_proximity = 1.0 - (distance_to_clt / clt_threshold_distance)
            detected_active_chains.append({
                "id": "CLT_APPROACH",
                "signals": ["H", "delta", "H"],
                "prox": round(clt_proximity, 2),
            })
    
    # --- SCALP_IMMEDIATE: immediate scalp opportunity ---
    if is_scalp_window_viable:
        scalp_confidence = 0.80
        if "rho" in signal_symbol_sequence:
            scalp_confidence += 0.10
        
        detected_active_chains.append({
            "id": "SCALP_IMMEDIATE",
            "signals": ["rho", "alpha", "delta"],
            "prox": min(1.0, scalp_confidence),
        })
    
    # --- FULL_HEDGE: complete protection mode ---
    if "H" in signal_symbol_sequence and "delta" in signal_symbol_sequence:
        hedge_confidence = 0.90
        detected_active_chains.append({
            "id": "FULL_HEDGE",
            "signals": ["H", "delta", "H"],
            "prox": hedge_confidence,
        })
    
    # Sort chains by proximity (confidence) descending
    detected_active_chains.sort(key=lambda chain: chain["prox"], reverse=True)
    
    return detected_active_chains

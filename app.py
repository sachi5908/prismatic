# app.py
from flask import Flask, render_template, request, jsonify
import numpy as np

app = Flask(__name__)

@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    """Receives survey data, calculates, and returns results as JSON."""
    data = request.get_json()
    
    try:
        lengths = np.array([float(item['length']) for item in data])
        bearings_deg = np.array([float(item['bearing']) for item in data])
        labels = [f"{chr(65+i)}-{chr(65+i+1)}" for i in range(len(lengths))]

        bearings_rad = np.deg2rad(bearings_deg)
        
        # Original Latitudes and Departures
        latitudes = lengths * np.cos(bearings_rad)
        departures = lengths * np.sin(bearings_rad)

        # 1. Calculate the ERROR vector components (the direction of the mistake)
        error_latitude = np.sum(latitudes)
        error_departure = np.sum(departures)
        closing_error_mag = np.sqrt(error_latitude**2 + error_departure**2)
        
        # Calculate bearing of the error for display
        if error_departure != 0 or error_latitude != 0:
            closing_error_bearing_rad = np.arctan2(error_departure, error_latitude)
            closing_error_bearing_deg = np.rad2deg(closing_error_bearing_rad)
            if closing_error_bearing_deg < 0: closing_error_bearing_deg += 360
        else:
            closing_error_bearing_deg = 0

        perimeter = np.sum(lengths)
        if perimeter == 0:
            return jsonify({"error": "Perimeter is zero"}), 400

        # --- DEFINITIVE CALCULATION LOGIC ---

        # 2. Calculate the unadjusted coordinates for each station (A, B, C, ... A')
                # 2. Calculate the unadjusted coordinates for each station (A, B, C, ... A')
        unadjusted_x = np.cumsum(np.insert(departures, 0, 0))
        unadjusted_y = np.cumsum(np.insert(latitudes, 0, 0))

        # 3. Total correction = vector needed to close the traverse (opposite of the error)
        total_correction_dep = -error_departure
        total_correction_lat = -error_latitude

        # 4. Fraction of total correction to apply at each station (Bowditch — cumulative length from A)
        cumulative_lengths = np.insert(np.cumsum(lengths), 0, 0)
        correction_fraction = cumulative_lengths / perimeter

        # 5. Corrections to add to each station (these are fractions of the total_correction)
        dep_correction_to_add = correction_fraction * total_correction_dep
        lat_correction_to_add = correction_fraction * total_correction_lat

        # 6. Apply the correction (this moves stations opposite to the error and closes the traverse)
        adjusted_x = unadjusted_x + dep_correction_to_add
        adjusted_y = unadjusted_y + lat_correction_to_add

        # Force exact closure: make last adjusted point exactly equal to the first station (A)
        # (this removes tiny floating-point residues and ensures D' -> A closes exactly)
        adjusted_x[-1] = unadjusted_x[0]
        adjusted_y[-1] = unadjusted_y[0]

        # Ensure A (first station) is unchanged
        adjusted_x[0] = unadjusted_x[0]
        adjusted_y[0] = unadjusted_y[0]




        # --- CALCULATIONS FOR THE RESULTS TABLE ---
        # The correction for each line is proportional to the line's length
        lat_line_correction = (lengths / perimeter) * total_correction_lat
        dep_line_correction = (lengths / perimeter) * total_correction_dep
        
        adj_lats = latitudes + lat_line_correction
        adj_deps = departures + dep_line_correction
        
        adj_lengths = np.sqrt(adj_lats**2 + adj_deps**2)
        adj_bearings_rad = np.arctan2(adj_deps, adj_lats)
        adj_bearings_deg = np.rad2deg(adj_bearings_rad)
        adj_bearings_deg[adj_bearings_deg < 0] += 360

        # Prepare table data for JSON response
        table_data = []
        for i in range(len(lengths)):
            table_data.append({
                "line": labels[i],
                "orig_len": f"{lengths[i]:.3f}",
                "orig_brg": f"{bearings_deg[i]:.3f}",
                "lat_corr": f"{lat_line_correction[i]:+.3f}",
                "dep_corr": f"{dep_line_correction[i]:+.3f}",
                "adj_len": f"{adj_lengths[i]:.3f}",
                "adj_brg": f"{adj_bearings_deg[i]:.3f}"
            })

        # Final JSON response
        return jsonify({
            "error_info": {
                "magnitude": f"{float(closing_error_mag):.3f}",
                "bearing": f"{float(closing_error_bearing_deg):.2f}"
            },
            "plot_data": {
                "unadjusted_x": unadjusted_x.tolist(),
                "unadjusted_y": unadjusted_y.tolist(),
                "adjusted_x": adjusted_x.tolist(),
                "adjusted_y": adjusted_y.tolist(),
                "lengths": lengths.tolist()
            },
            "bowditch_data":{
                "perimeter": float(perimeter),
                "cumulative_lengths": np.insert(np.cumsum(lengths), 0, 0).tolist(),
                "error_magnitude": float(closing_error_mag),
            },
            "table_data": table_data
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const segmentCountInput = document.getElementById('segment-count');
    const generateTableBtn = document.getElementById('generate-table-btn');
    const calculateBtn = document.getElementById('calculate-btn');
    const inputTableContainer = document.getElementById('input-table-container');
    const resultsTableBody = document.getElementById('results-table-body');
    const errorMagnitudeEl = document.getElementById('error-magnitude');
    const errorBearingEl = document.getElementById('error-bearing');
    const spinner = document.getElementById('spinner');
    const tabNav = document.querySelector('.tab-nav');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const traversePlotDiv = document.getElementById('traverse-plot');
    const bowditchPlotDiv = document.getElementById('bowditch-plot');

    // --- Tab Switching Logic ---
    tabNav.addEventListener('click', (e) => {
        const clickedTab = e.target.closest('.tab-link');
        if (!clickedTab) return;

        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));

        const tabId = clickedTab.dataset.tab;
        const activePane = document.getElementById(tabId);
        clickedTab.classList.add('active');
        activePane.classList.add('active');

        if (tabId === 'tab-traverse') {
            Plotly.Plots.resize(traversePlotDiv);
        } else if (tabId === 'tab-bowditch') {
            Plotly.Plots.resize(bowditchPlotDiv);
        }
    });

    // --- Initial Setup ---
    generateInputTable();
    generateTableBtn.addEventListener('click', generateInputTable);
    calculateBtn.addEventListener('click', calculateTraverse);
    
    // --- Main Functions ---

    function generateInputTable() {
        const count = parseInt(segmentCountInput.value, 10);
        if (count < 2 || count > 20) {
            alert("Please enter a number of segments between 2 and 20.");
            return;
        }

        let tableHtml = '<table><thead><tr><th>Line</th><th>Length (m)</th><th>Bearing (WCB °)</th></tr></thead><tbody>';
        const defaultData = [
            { len: 100.2, brg: 45.5 }, { len: 120.5, brg: 150.0 },
            { len: 89.8, brg: 220.25 }, { len: 110.0, brg: 310.75 }
        ];

        for (let i = 0; i < count; i++) {
            const lineLabel = `${String.fromCharCode(65 + i)}-${String.fromCharCode(65 + i + 1)}`;
            const len = defaultData[i] ? defaultData[i].len : '';
            const brg = defaultData[i] ? defaultData[i].brg : '';
            tableHtml += `
                <tr>
                    <td>${lineLabel}</td>
                    <td><input type="number" class="length-input" value="${len}" step="0.01" required></td>
                    <td><input type="number" class="bearing-input" value="${brg}" step="0.01" required></td>
                </tr>
            `;
        }
        tableHtml += '</tbody></table>';
        inputTableContainer.innerHTML = tableHtml;
    }

    async function calculateTraverse() {
        const lengthInputs = document.querySelectorAll('.length-input');
        const bearingInputs = document.querySelectorAll('.bearing-input');
        const payload = [];

        for (let i = 0; i < lengthInputs.length; i++) {
            const length = lengthInputs[i].value;
            const bearing = bearingInputs[i].value;

            if (length === '' || bearing === '') {
                alert('Please fill in all length and bearing fields.');
                return;
            }
            payload.push({ length, bearing });
        }

        spinner.style.display = 'block';
        calculateBtn.disabled = true;

        try {
            const response = await fetch('/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Calculation failed on the server.');
            }

            const results = await response.json();
            updateUI(results);

        } catch (error) {
            alert(`An error occurred: ${error.message}`);
        } finally {
            spinner.style.display = 'none';
            calculateBtn.disabled = false;
        }
    }

    function updateUI(results) {
        errorMagnitudeEl.textContent = results.error_info.magnitude;
        errorBearingEl.textContent = results.error_info.bearing;

        resultsTableBody.innerHTML = '';
        results.table_data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row.line}</td><td>${row.orig_len}</td><td>${row.orig_brg}</td><td>${row.lat_corr}</td><td>${row.dep_corr}</td><td>${row.adj_len}</td><td>${row.adj_brg}</td>`;
            resultsTableBody.appendChild(tr);
        });

        plotTraverse(results.plot_data, results.table_data);
        plotBowditchMethod(results.bowditch_data);

        document.querySelector('[data-tab="tab-traverse"]').click();
    }

    // --- Plotting Configuration and Functions ---

    const plotLayoutOptions = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: 'var(--text-light)' },
        xaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.1)' },
        yaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.1)' },
        legend: { x: 1, xanchor: 'right', y: 1 },
        margin: { l: 60, r: 40, b: 50, t: 80 }
    };

    function plotTraverse(plotData, tableData) {
        const { unadjusted_x, unadjusted_y, adjusted_x, adjusted_y } = plotData;
        const stationChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        const unadjustedLineColor = '#FFFFFF';
        const adjustedLineColor = '#32CD32';
        const stationAdjustmentLineColor = 'rgba(192,192,192,0.8)';

        const unadjustedTrace = {
            x: unadjusted_x, y: unadjusted_y, mode: 'lines+markers', name: 'Unadjusted',
            line: { color: unadjustedLineColor, dash: 'dash', width: 1.5 },
            marker: { size: 8, color: unadjustedLineColor },
        };

        const adjustedTrace = {
            x: adjusted_x, y: adjusted_y, mode: 'lines+markers', name: 'Adjusted',
            line: { color: adjustedLineColor, width: 3 },
            marker: { size: 9, color: adjustedLineColor },
        };
        
        const annotations = [];
        
        // --- Parallel labels for segments ---
        function createParallelLabel(x1, y1, x2, y2, labelText, color, offsetSign) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            let xanchor, yanchor, xshift, yshift;
            const offset = 10;

            if (angle > -45 && angle <= 45) { 
                xanchor = 'center'; yanchor = 'top'; xshift = 0; yshift = -offset * offsetSign;
            } else if (angle > 45 && angle <= 135) { 
                xanchor = 'left'; yanchor = 'middle'; xshift = offset * offsetSign; yshift = 0;
            } else if (angle > 135 || angle <= -135) { 
                xanchor = 'center'; yanchor = 'bottom'; xshift = 0; yshift = offset * offsetSign;
            } else { 
                xanchor = 'right'; yanchor = 'middle'; xshift = -offset * offsetSign; yshift = 0;
            }

            return {
                x: (x1 + x2) / 2, y: (y1 + y2) / 2,
                text: labelText,
                showarrow: false, font: { color: color, size: 11 },
                xanchor: xanchor, yanchor: yanchor,
                xshift: xshift, yshift: yshift,
                bgcolor: 'rgba(0,0,0,0.6)',
                borderpad: 2,
            };
        }

        for (let i = 0; i < tableData.length; i++) {
            annotations.push(createParallelLabel(
                unadjusted_x[i], unadjusted_y[i], unadjusted_x[i+1], unadjusted_y[i+1],
                `${parseFloat(tableData[i].orig_len).toFixed(2)}m @ ${parseFloat(tableData[i].orig_brg).toFixed(2)}°`,
                '#FFFF00', -1
            ));

            annotations.push(createParallelLabel(
                adjusted_x[i], adjusted_y[i], adjusted_x[i+1], adjusted_y[i+1],
                `${parseFloat(tableData[i].adj_len).toFixed(2)}m @ ${parseFloat(tableData[i].adj_brg).toFixed(2)}°`,
                '#00FFFF', 1
            ));
        }
        
        // --- Station labels ---
        for (let i = 0; i < unadjusted_x.length; i++) {
            annotations.push({
                x: unadjusted_x[i], y: unadjusted_y[i], ax: 25, ay: -25,
                text: `<b>${i === unadjusted_x.length - 1 ? "A'" : stationChars[i]}</b>`,
                showarrow: false, font: { color: unadjustedLineColor, size: 14 }
            });
            if (i < adjusted_x.length - 1) {
                annotations.push({
                    x: adjusted_x[i], y: adjusted_y[i], ax: -25, ay: 25,
                    text: `<b>${i === 0 ? "A" : stationChars[i] + "'"}</b>`,
                    showarrow: false, font: { color: adjustedLineColor, size: 14 }
                });
            }
        }
        
        const adjustmentShapes = [];
        for (let i = 1; i < unadjusted_x.length - 1; i++) {
            adjustmentShapes.push({
                type: 'line', x0: unadjusted_x[i], y0: unadjusted_y[i],
                x1: adjusted_x[i], y1: adjusted_y[i],
                line: { color: stationAdjustmentLineColor, width: 1, dash: 'dot' }
            });
        }

        const dummyTrace = {
            x: [null], y: [null], mode: 'lines', name: 'Station Adjustment',
            line: { color: stationAdjustmentLineColor, width: 1, dash: 'dot' }
        };
        
        // --- Red error arrow A' -> A ---
        annotations.push({
            x: adjusted_x.at(-1), y: adjusted_y.at(-1),       // tip = A (adjusted last)
            ax: unadjusted_x.at(-1), ay: unadjusted_y.at(-1), // tail = A' (unadjusted last)
            xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
            text: '', showarrow: true, arrowhead: 4, arrowsize: 1.2,
            arrowcolor: 'red', opacity: 0.95
        });

        const layout = {
            ...plotLayoutOptions,
            title: 'Survey Traverse Plot',
            xaxis: { ...plotLayoutOptions.xaxis, title: 'Departure (East-West)', scaleanchor: 'y', scaleratio: 1 },
            yaxis: { ...plotLayoutOptions.yaxis, title: 'Latitude (North-South)' },
            annotations: annotations,
            shapes: adjustmentShapes,
            dragmode: 'pan' 
        };

        const config = { responsive: true, scrollZoom: true };
        Plotly.newPlot(traversePlotDiv, [unadjustedTrace, adjustedTrace, dummyTrace], layout, config);
    }


    function plotBowditchMethod(data) {
        const { perimeter, cumulative_lengths, error_magnitude } = data;
        const correction_magnitudes = cumulative_lengths.map(len => (len / perimeter) * error_magnitude);
        const stationChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        const mainTrace = {
            x: cumulative_lengths, y: correction_magnitudes, mode: 'lines+markers', name: 'Correction Magnitude',
            line: { color: 'var(--secondary)', width: 3 }
        };
        
        const shapes = [];
        const annotations = [];

        cumulative_lengths.forEach((len, i) => {
            shapes.push({
                type: 'line', x0: len, y0: 0, x1: len, y1: correction_magnitudes[i],
                line: { color: 'rgba(192,192,192,0.8)', width: 1, dash: 'dash' }
            });
            annotations.push({
                x: len, y: 0, ax: 0, ay: -30,
                text: `<b>${i === cumulative_lengths.length - 1 ? "A'" : stationChars[i]}</b>`,
                showarrow: false, font: {size: 14, color: '#FFFFFF'}
            });
        });

        const config = { responsive: true, scrollZoom: true };
        const layout = {
            ...plotLayoutOptions,
            title: "Bowditch's Correction vs. Length",
            xaxis: { ...plotLayoutOptions.xaxis, title: 'Cumulative Length (m)' },
            yaxis: { ...plotLayoutOptions.yaxis, title: 'Magnitude of Correction (m)', range: [0, error_magnitude * 1.2 || 1] },
            shapes: shapes,
            annotations: annotations,
            dragmode: 'pan'
        };

        Plotly.newPlot(bowditchPlotDiv, [mainTrace], layout, config);
    }
});
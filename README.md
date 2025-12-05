# GEE_forest_agreement_layer
The Forest Agreement Layer is a set of GEE scripts that merges nine/ten global forest datasets into one map, separating steps needing user input from automated tasks. It highlights where sources agree on forest cover, following Freitas Beyer et al. (2025).

# Forest Agreement Layer – Google Earth Engine Script

## Overview
This repository hosts two Google Earth Engine (GEE) scripts designed to generate a forest agreement layer. The workflow compares forest/tree cover-related datasets and highlights areas where multiple sources point in the same direction. 

The repository includes:
- **src/** – the main GEE scripts written in JavaScript  
- **docs/** – PDF tutorials that explains the reasoning, steps, and interpretation  

---

## What the Script Does
The script processes selected forest datasets, harmonizes them for comparison, and produces an “agreement layer.” This layer identifies where datasets align or disagree, helping users interpret forest conditions with more confidence.

Key steps performed by the script:
1. Load and prepare the input datasets  
2. Standardize spatial resolution and projections  
3. Compare the layers and compute each agreement category  
4. Export or display the final map in the GEE interface
5. Provide summary tables of forest/tree cover area  

---

## Scripts

### 1. ROI Script
**Purpose:** Generates a forest agreement layer over user-defined ROIs in GEE.  

**Key Features:**
- Supports ROIs drawn in the Code Editor, built-in boundaries, imported from Drive/Assets, programmatically created, or derived from image/collection bounds.  
- Covers data preparation, reclassification, agreement calculation, cluster-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.  

**File:** `src/Geodata_script/GEE_forest_agreement_ROI_v1.0.js` 

---

### 2. GeoData Script
**Purpose:** Generates a forest agreement layer over user-defined polygons or points.  

**Key Features:**
- Performs data preparation, reclassification, agreement calculation, cluster-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.  

**File:** `src/Geodata_script/GEE_forest_agreement_GEODATA_v1.0.js` 

---
> **Note:** Both scripts are designed to be modular and user-friendly, allowing you to reproduce analyses over custom ROIs or polygons with minimal setup.
---

## How to Run the Script
1. Open the GEE Code Editor and paste the script, or use the shareable link provided at XXX (using the link is not recommended for full reproducibility).  
2. Adjust the input parameters at the top of the script (ROI, datasets, thresholds).  
3. Run the script to generate the agreement layer.  
4. Export the final result if desired (e.g., to Google Drive, Earth Engine Assets).  

If you are new to GEE, there are tutorials at **https://developers.google.com/earth-engine/tutorials/tutorials** which can provide a guided walkthrough.

---

## About the Documentation (PDFs)
The PDF tutorial in `docs/` explains:
- The logic behind the forest agreement concept  
- Dataset descriptions  
- Step-by-step instructions  
- Visual examples  
- Notes on interpretation and limitations  

Use it as a companion to the script for understanding how the workflow fits together.

---

## Inputs and Outputs
### **Inputs**
- Forest-related datasets defined within the script  
- Paths to region of interest (ROI): geodata of the production area or a user-defined geometry
- Thresholds used in the comparison
- Data type and format options: choose input datasets, specify output format, and set export parameters

### **Outputs**
- A visual GEE layer showing agreement categories  
- Exported raster of the forest agreement layer for the ROI
- CSV file summarizing forest/tree cover area  

---

## License
This project is released under the terms of the license specified in the `LICENSE` file.

---

## Publications

This project is associated with several publications, dataset descriptions, and policy briefs.  
For detailed information, please see the dedicated [Publications](publications.md) page.


## Contact
If you have questions or suggestions, feel free to open an issue in this repository or reach out directly.


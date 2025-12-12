# GEE_forest_agreement_layer
The Forest Agreement Layer is a set of GEE scripts that merges nine/ten global forest datasets into one map, separating steps needing user input from automated tasks. It highlights where sources agree on forest/tree cover, following Freitas Beyer et al. (2025).
https://www.thuenen.de/de/fachinstitute/waldwirtschaft/projekte-liste/waldwirtschaft-weltweit/geos-eudr-1

# Forest Agreement Layer – Google Earth Engine Script

## Overview
This repository hosts two Google Earth Engine (GEE) scripts designed to generate the forest agreement layer. 
One script generates the layer for a predefined region, while the other builds it directly from geodata inputs such as plot boundaries.

The repository includes:
- **src/** – the main GEE scripts written in JavaScript  
- **docs/** – PDF tutorials that explains the reasoning, steps, and interpretation  

---

## What the Script Does
The script processes selected forest/tree cover datasets, harmonizes them for comparison, and produces an “agreement layer”. This layer identifies where datasets align or disagree, highlighting areas where multiple sources point in the same direction.

Key steps performed by the script:
1. Load and prepare the input datasets  
2. Standardize spatial resolution and projections  
3. Compare the layers and compute each agreement category
4. Filtering agreement by a defined minimum mapping unit (0.5ha)
5. Export or display the final map in the GEE interface
6. Provide summary tables of forest/tree cover area  

---

## Scripts

### 1. GeoData Script
**Purpose:** Generates a forest agreement layer over user-defined polygons or points.  

**Key Features:**
- Performs data preparation, reclassification, agreement calculation, sieve-filtering, cluster-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.
- For polygon datasets, the assessment is carried out directly on each polygon. For point datasets, a user-defined buffer is created around each point to simulate a polygon, and the assessment is then performed within that buffered area.

**File:** `src/Geodata_script/GEE_forest_agreement_GEODATA_v1.0.js` 

**Quick View / Test in GEE**: [GEE Code Editor Link](https://code.earthengine.google.com/8adfc41e1a5107ac21586ae277d69860)


---
> **Note:** Both scripts are designed to be modular and user-friendly, allowing you to reproduce analyses over custom ROIs or polygons/points with minimal setup.
---

### 2. ROI Script
**Purpose:** Generates a forest agreement layer over user-defined geometry in GEE.  

**Key Features:**
- Supports geometry drawn in the Code Editor, built-in boundaries, imported from Drive/Assets, programmatically created, or derived from image/collection bounds.  
- Covers data preparation, reclassification, agreement calculation, sieve-filtering, tiled-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.  

**File:** `src/Geodata_script/GEE_forest_agreement_ROI_v1.0.js` 

**Quick View / Test in GEE**
You can view and run the script directly in Google Earth Engine: 
[GEE Code Editor Link](https://code.earthengine.google.com/75f2a18de48bbcad213f35331d355ccf)

---
> **Note:** Using the GEE sharable link directly is ONLY recommended for quick checks, testing, or exploring results, but not ideal for full development,
since relying on the shared GEE link can make version control, reproducibility, and integration with other tools more difficult.
---

## How to Run the Script
1. Open the GEE Code Editor and paste the script (.js, in `src/Geodata_script/`), or use the shareable link provided at "Quick View / Test in GEE"  (using the link is not recommended for full reproducibility).  
2. Adjust the input parameters at the top of the script (input and output parameters, thresholds, etc.).  
3. Run the script to generate the agreement layer. A detailed tutorial on running each script, along with explanations of all settings, is provided in the corresponding “docs” folder. 
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
- Paths to region of interest: geodata of the production area or a user-defined geometry
- Thresholds used in the comparison (user-defined constants)
- Data type and format options: choose input datasets, specify output format, and set export parameters

### **Outputs**
- A simplified/limited visual GEE layer showing agreement categories  
- Exported raster (GeoTIFF) of the forest agreement layer for the ROI
- CSV file summarizing forest/tree cover area  

---

## **Color Legend**
Color scheme provided in three formats `(.xlsx, .clr, .txt)`, aligned with the structure used in the GEE scripts.
This makes it easier to use the same colors in other environments, such as GIS software or geopandas.

**Found in:** `src/color_legend/`

---

## License

This project is released under the terms of the MIT license specified in the `LICENSE` file.
If you plan to create any material based on the Forest Agreement Layer scripts, please ensure that you cite them appropriately.
Copyright © 2025 Thünen-Institute, Juliana Freitas Beyer, Margret Köthke, Melvin Lippe.

---

## Publications

This project is associated with several publications, dataset descriptions, and policy briefs.  
For detailed information, please see the dedicated [Publications](publications.md) page.


## Contact
If you have questions or suggestions, feel free to open an issue in this repository or reach out directly (geos-eudr@thuenen.de).


<img width="2183" height="1004" alt="ForestAgreementLayer" src="https://github.com/user-attachments/assets/d06a9274-0924-41b2-a090-a81b1d71fa43" />

# Forest Agreement Layer - Google Earth Engine Script
The **Forest Agreement Layer (FAL)** is a set of [Google Earth Engine](https://earthengine.google.com/) (GEE) scripts that merges global forest datasets (currently up to 9) into one single map, separating steps requiring user input from automated tasks. The term *forest agreement* refers to a multi-source blend of global forest and tree-cover datasets to highlight where maps agree or disagree on forest/tree cover. 

A FAL can be for example used by operators or producers for due diligence purposes relating to the [Regulation on Deforestation-free Products](https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en) **(EUDR)** as it refers to the cut-off year and the definitions set out in the regulation. It can be further used to monitor compliance with deforestation-free requirements beyond the scope of the EUDR or for completely other purposes defined by a user.

---

The approach builds on the work of [Freitas Beyer et al. (2025)](https://www.mdpi.com/2072-4292/17/17/3012), who identified eight datasets as particularly well suited for compliance verification under the EUDR. The current version of the collection extends this foundation by adding a ninth dataset *Global Forest Types 2020, v0* (Bourgoin et al., 2024) which is available through the [JRC portal](https://forobs.jrc.ec.europa.eu/GFT) and the [Google Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/JRC_GFC2020_subtypes_V0). 

The current FAL product here remains closely aligned with the criteria defined in the original study by Freitas Beyer et al. (2025). However, because the Global Forest Types 2020 dataset was released after the article’s final compilation in November 2024, it could not be included in their assessment. Nevertheless, the GEE script allows users to extend the currently hosted 9 datasets further based on individual needs or data requirements.  

This work is part of the [**GEOS-EUDR**](https://www.thuenen.de/en/cross-institutional-projects/geos-eudr) research project and aims to improve the feasibility of the EUDR in the field of geolocation and the detection of deforestation and forest degradation using remote sensing-based products and geocomputation. GEOS-EUDR is funded by the [Federal Ministry for Economic Cooperation and Development](https://www.bmz.de/en) (BMZ) based on a decision by the German Bundestag.

---

## Overview
The repository hosts two Google Earth Engine (GEE) scripts designed to generate the forest agreement layer. 
One script generates the agreement layer for a predefined region of interest (ROI), while the other builds the agreement layer directly from geodata inputs such as plot boundaries uploaded by a user.

**The repository includes:**
- **src/** – the main GEE scripts written in JavaScript
- **docs/** – PDF tutorials that explains the reasoning, steps, and interpretation  

---

## What the Script Does
The script processes selected forest/tree cover datasets, harmonizes them for comparison, and produces the **“forest agreement layer”**. This layer **(FAL)** identifies where datasets align or disagree, highlighting areas where multiple map sources point in the same direction.

**Key steps performed by the script:**
1. Load and prepare the input datasets  
2. Standardize spatial resolution and projections  
3. Compare the layers and compute each agreement category
4. Filtering agreement by a defined minimum mapping unit (0.5 ha following the forest definition by FAO)
5. Export or display the final map in the GEE interface
6. Provide summary tables of forest/tree cover area  

---
> **Note:** Both scripts are designed to be modular and user-friendly, allowing you to reproduce analyses over custom regions of interest (ROIs) or polygons/points with minimal setup requirements.
---

### 1. GeoData Script
**Purpose:** Generates a FAL over user-defined polygons or points in GEE.  

**Key Features:**
- Performs data preparation, reclassification, agreement calculation, sieve-filtering, cluster-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.
- For polygon datasets, the assessment is carried out directly on each polygon. For point datasets, a user-defined buffer is created around each point to simulate a polygon, and the assessment is then performed within that buffered area.

**File:** `src/Geodata_script/GEE_forest_agreement_GEODATA_v1.0.js` 

**Tutorial 1:** [GeoData](https://github.com/user-attachments/files/24526098/GEOS_EUDR_Tutorial_1_Geodata.pdf)

**Quick View / Test in GEE**: [GEE Code Editor Link](https://code.earthengine.google.com/8adfc41e1a5107ac21586ae277d69860)

---

### 2. ROI Script
**Purpose:** Generates a FAL over an user-defined geometry in GEE.  

**Key Features:**
- Supports a geometry drawn in the GEE Code Editor, built-in boundaries, imported from Drive/Assets, programmatically created, or derived from image/collection bounds.  
- Covers data preparation, reclassification, agreement calculation, sieve-filtering, tiled-based exports, and forest extent summaries.  
- Includes a user section for setting parameters and an automated section that handles all processing steps.  

**File:** `src/Geodata_script/GEE_forest_agreement_ROI_v1.0.js` 

**Tutorial 2:** [ROI](https://github.com/user-attachments/files/24526103/GEOS_EUDR_Tutorial_2_ROI.pdf)



**Quick View / Test in GEE**
You can view and run the script directly in Google Earth Engine: 
[GEE Code Editor Link](https://code.earthengine.google.com/75f2a18de48bbcad213f35331d355ccf)

---
> **Note:** Using the GEE sharable link directly is **ONLY** recommended for quick checks, testing, or exploring results, but not ideal for full development,
since relying on the shared GEE link can make version control, reproducibility, and integration with other tools more difficult.
---

## How to Run the Script
1. Open the GEE Code Editor and paste the script (.js, in `src/Geodata_script/`), or use the shareable link provided at "Quick View / Test in GEE"  (**using the link is not recommended for full reproducibility**).  
2. Adjust the input parameters at the top of the script (input and output parameters, thresholds, etc.).  
3. Run the script to generate the forest agreement layer. A detailed tutorial on running each script, along with explanations of all settings, is provided in the corresponding **“docs”** folder. 
4. Export the final result if desired (e.g., to Google Drive, Earth Engine Assets).  

If you are new to GEE, there are tutorials at https://developers.google.com/earth-engine/tutorials/tutorials which can provide a guided walkthrough.

---

## About the Documentation (PDFs)
The PDF tutorials in `docs/` and the links above explain:
- The logic behind the forest agreement layer concept  
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

This project is released under the terms of the **MIT license specified in the `LICENSE` file**.
If you plan to create any material based on the Forest Agreement Layer scripts, please ensure that you cite them appropriately.

**©Copyright 2026, Thünen-Institute, GEOS-EUDR, Juliana Freitas Beyer, Margret Köthke, Melvin Lippe**.

---

## Suggested Citation
Freitas Beyer, J., Köthke, M., & Lippe, M. (2026). GEOS-EUDR: Forest Agreement Layer - Google Earth Engine Script (Version 1). Zenodo. https://doi.org/10.5281/zenodo.18174580

---

## Publications

This project is associated with several publications, dataset descriptions, and policy briefs.  
For detailed information, please see the dedicated [Publications](publications.md) page.


## Contact
If you have questions or suggestions, feel free to open an issue in this repository or reach out to: **geos-eudr@thuenen.de**.


# Data sources

Links checked on 2026-11-08 and 2026-11-12. Every source used in the product must be cited on the project page. Large raw files stay out of Git (see `.gitignore` and `data/AGENTS.md`). Full notes, scouting findings and safety-rule citations: `docs/preparation/preparations.md`.

Numbers found while scouting before kickoff are not used as-is. They are recomputed at the event in committed code.

## Core datasets

| Data type | Dataset | Details | Notes |
|---|---|---|---|
| Optical | [MSL Gale Merged Orthophoto Mosaic 25cm v3](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm), USGS (HiRISE) | 25 cm/px, 8 bit, about 23 GB, BigTIFF, 128 × 128 tiles | Load a window with HTTP range requests. |
| Optical, colour | [MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif) | Colour HiRISE COG, 25 cm, JPEG, with overviews | Covers our extent. |
| Topography | [MSL Gale Merged DEM 1m v3](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m), USGS | 1 m/px, float32, about 3.6 GB, classic TIFF, LZW, one row per strip | A window loads full rows, a few hundred MB. |
| Thermal | [THEMIS Thermal Inertia 30S120E](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp), USGS | 100 m/px | Context layer only, not a sand detector. |
| Spectral | CRISM via the [Orbital Data Explorer](https://ode.rsl.wustl.edu/mars/) | FRT000058A3 and FRT0000B6F1 (18 m), HRL0000BABA (36 m); use the 60-parameter summary cube | Cannot tell ridge from hollow. |
| Chemical | Curiosity APXS, ChemCam, CheMin via the [PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/msl/index.htm) | Measured chemistry at the campaign stops | |
| Radiation | Hassler et al. 2014, *Science* 343, [DOI 10.1126/science.1244797](https://doi.org/10.1126/science.1244797); RAD data at [PDS PPI](https://pds-ppi.igpp.ucla.edu/) | 0.64 ± 0.12 mSv/day (use this, not the 0.67 of the press release) | Information only, not a gate. |
| Space weather | DONKI via [api.nasa.gov](https://api.nasa.gov/) (`notifications`, `CMEAnalysis`, `SEP`) | Preliminary research products | Only for the after-freeze solar storm event. |
| Atmosphere | [Curiosity REMS weather feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json) | JSON key `soles`, newest first; `sunrise`, `sunset`, `atmo_opacity` | Last entry 2026-08-25, sol 4995. Gives the daylight rule. |
| Rover route | [MSL_traverse.json](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json), [MSL_waypoints.json](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | GeoJSON; `sol`, `lon` (east-positive), `lat`, `elev_geoid`, `dist_km` | Waypoints up to sol 5045. |
| Ground images | [Raw image API](https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=50&page=0&condition_1=msl:mission&condition_2=4700:sol:gte&condition_3=4710:sol:lte) | Filter by sol; items have `sol`, `instrument`, `https_url` | Download the images used; no hotlinking. |

## Access notes

- `planetarymaps.usgs.gov` redirects (302) to `asc-pds-services.s3.us-west-2.amazonaws.com`. Use `curl -L` or the S3 URL. Range requests work.
- DEM and orthophoto: equirectangular, center longitude 0, R = 3,396,190 m, so lon° = x / 59274.70 at 1 m.
- The GDAL command-line tools are not installed. tifffile or rasterio read windows.
- Files used so far (bucket prefix `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/`): `MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` with `.tif.ovr` (overview factors 4–256, factor 4 = 1 m), `MSL_Gale_DEM_Mosaic_1m_v3.tif` with `.tif.ovr`. `pipeline/ortho_overlay.py` reads the orthophoto window over range requests; see `pipeline/README.md`.

## Other useful sources

- [Mars Trek](https://trek.nasa.gov/mars/) and its [WMTS tiles](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) (geographic grid, 2 × 1 tiles at level 0, `{z}/{y}/{x}`).
- [Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html), if REMS sunrise and sunset are not enough.
- [Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/).
- [NASA blog, final boxwork phase](https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration) and [HiRISE view of the boxwork](https://science.nasa.gov/resource/hirise-views-mount-sharps-boxwork).

## Safety rules and planetary protection

Citations for the EVA rules (xEVA, Apollo planning, suited walking tests, NASA-STD-3001) and the planetary protection sources (COSPAR, NASA NID 8715.129) are listed in `docs/preparation/preparations.md`, section "Sources for the safety rules".

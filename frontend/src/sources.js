// Source chips: every value names where it comes from (hover or focus shows why). Shared by the
// console panels and the crew views.
import { srcChip } from './format.js';

export const SRC = {
  xEVA: ['NASA EVA', 'NASA, Exploration EVA System Concept of Operations, Rev B, 2020: 60-minute safe-haven rule, suit slope requirement up to 20°, radio-loss procedure.'],
  DEM: ['USGS', 'Elevation and 10 m slope from the USGS Gale DEM (pipeline).'],
  REMS: ['REMS', 'Curiosity REMS weather feed: sunrise and sunset per sol (last reading sol 4995).'],
  RAD: ['Hassler', 'Hassler et al. 2014, Science 343: 0.64 ± 0.12 mSv per day at Gale. Information only, never a gate.'],
  LOO: ['LOO', 'Leave-one-out comparison with Curiosity\'s drives (routing engine).'],
  ROUTE: ['routes', 'Precomputed routes from the routing engine (shared/data-contract.md).'],
  GRID: ['grid', 'Time-to-base grid from the routing engine: minutes to the habitat from every 10 m cell (shared/data-contract.md).'],
  ASSUME: ['assum.', 'Labeled assumption, set by the team and listed in the Assumptions panel.'],
  TOBLER: ['Tobler', 'Tobler 1993, NCGIA Technical Report 93-1: hiking speed against slope, normalised so level ground gives the base speed; uphill and downhill differ. A terrestrial function, not validated for suited crews on Mars.'],
  EWT: ['EWT', 'About 2 km/h in NASA lunar planning (xEVA); 1.5 km/h on Mars is a labeled slowdown after Norcross et al., NASA TP-2009-214796.'],
  PP: ['COSPAR', 'COSPAR policy for human missions to Mars and NASA NID 8715.129 (2020): the reason for protected zones. Still to be checked against the primary texts.'],
};
export const src = (k) => srcChip(SRC[k][0], SRC[k][1], k === 'ASSUME');

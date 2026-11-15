"""Start under xvfb-run -a python tests/gui_export_smoke.py"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import tkinter.filedialog as fd
import tkinter.messagebox as mb
from mars_mapper.viewer import MapWindow

app=MapWindow(Path(__file__).resolve().parents[1])
app.withdraw()
root=Path(__file__).resolve().parents[1]
app._import_layer(root/'demo'/'gale_map.tif','map')
app._import_layer(root/'demo'/'gale_elevation.tif','raster')
app._import_layer(root/'demo'/'gale_thermal.csv','csv',radius=1000)
with TemporaryDirectory() as tmp:
    fd.askdirectory=lambda **kw: tmp
    mb.askyesno=lambda *args,**kw: False
    mb.showinfo=lambda *args,**kw: None
    mb.showwarning=lambda *args,**kw: None
    mb.showerror=lambda *args,**kw: (_ for _ in ()).throw(Exception(args))
    app._export_data()
    for i in range(500):
        app.update()
        if not app._export_active:
            break
        import time; time.sleep(.04)
    assert not app._export_active, 'GUI export did not finish'
    r=json.loads((Path(tmp)/'manifest.json').read_text())
    assert len(r['layers'])==3 and not r['errors']
    print('GUI smoke passed, exported:',len(r['layers']))
app._close()

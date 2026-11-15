"""Desktop-Oberfläche. Die Kartenzuordnung erfolgt ausschließlich in core/local_grid/rendering."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import threading
import queue
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog

import numpy as np
from PIL import Image, ImageTk
from pyproj import CRS

from .core import GeoRaster, CsvPointLayer, MarsMapper, Viewport, MARS_SPHERE_GEO_CRS
from .fixed_grid import FixedGrid
from .analysis_export import ExportLayer, export_region
from .local_grid import LocalMetricGrid
from .rendering import (
    geo_tiff_preview_window, csv_point_preview_window,
    geo_tiff_layer_bounds, csv_layer_bounds, _check_mars_crs,
)

BG = '#101820'
PANEL = '#192634'
PANEL_DARK = '#121f2d'
TEXT = '#eef3f8'
MUTED = '#a5b8c8'
ACCENT = '#69c9ee'
GRID = '#50d3b0'


@dataclass
class DisplayLayer:
    name: str
    kind: str  # map | raster | csv
    source: GeoRaster | CsvPointLayer
    preview: Image.Image | None = None
    visible: bool = True


class MapWindow(tk.Tk):
    def __init__(self, project_dir: Path):
        super().__init__()
        self.project_dir = project_dir
        self.config_path = project_dir / 'fixed_grid.json'
        self.grid_spec = self._read_grid()
        self.mapper = MarsMapper(self.grid_spec)
        self.layers: list[DisplayLayer] = []
        self.viewport = Viewport(self.grid_spec.columns, self.grid_spec.rows, 900, 680)
        self.photo = None
        self.last_mouse = None
        self.hover_job = None
        self.render_job = None
        self.drag_xy = None
        self.title('Mars Geo Data Analyzer · Festes Koordinatenraster')
        self.geometry('1270x790')
        self.minsize(1000, 630)
        self.configure(bg=BG)
        self._style()
        self._ui()
        self.protocol('WM_DELETE_WINDOW', self._close)
        self.after(150, self._fit)

    def _read_grid(self) -> LocalMetricGrid:
        grid = FixedGrid.load(self.config_path)
        if not isinstance(grid, LocalMetricGrid):
            raise ValueError('Diese Oberfläche benötigt mode="local_metric" in fixed_grid.json.')
        if grid.reference_position != 'center':
            raise ValueError('reference_position muss "center" sein (Mittelpunkt des Rasters).')
        return grid

    def _style(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TButton', padding=(9, 7), font=('Arial', 10))
        style.configure('Treeview', background=PANEL_DARK, fieldbackground=PANEL_DARK,
                        foreground=TEXT, rowheight=29, borderwidth=0)
        style.configure('Treeview.Heading', background='#27384a', foreground=TEXT, padding=5)
        style.map('Treeview', background=[('selected','#2d566d')])

    def _ui(self):
        top = tk.Frame(self, bg=BG)
        top.pack(side='top', fill='x', padx=12, pady=(10,7))
        tk.Label(top, text='MARS DATA ANALYZER', bg=BG, fg=TEXT,
                 font=('Arial', 17, 'bold')).pack(side='left', padx=(0,20))
        for text, command in (
            ('+ Karten-Layer', self._add_map),
            ('+ GeoTIFF-Daten', self._add_raster),
            ('+ JMARS-CSV', self._add_csv),
        ):
            ttk.Button(top, text=text, command=command).pack(side='left', padx=3)
        navigation = tk.Frame(self, bg=BG)
        navigation.pack(side='top', fill='x', padx=12, pady=(0,9))
        for text, command in (
            ('Raster konfigurieren', self._config_dialog),
            ('Config neu laden', self._reload_config),
            ('Raster zentrieren', self._fit),
            ('Layer komplett', self._fit_layer),
            ('Demo laden', self._load_demo),
            ('Daten zuschneiden / exportieren', self._export_data),
        ):
            ttk.Button(navigation, text=text, command=command).pack(side='left', padx=3)

        main = tk.Frame(self, bg=BG)
        main.pack(fill='both', expand=True, padx=12, pady=(0,7))
        main.grid_columnconfigure(0, minsize=278, weight=0)
        main.grid_columnconfigure(1, weight=1)
        main.grid_columnconfigure(2, minsize=310, weight=0)
        main.grid_rowconfigure(0, weight=1)
        left = tk.Frame(main, bg=PANEL, width=278)
        center = tk.Frame(main, bg=BG)
        right = tk.Frame(main, bg=PANEL, width=310)
        left.grid(row=0, column=0, sticky='nsew')
        center.grid(row=0, column=1, sticky='nsew', padx=6)
        right.grid(row=0, column=2, sticky='nsew')
        left.pack_propagate(False)
        right.pack_propagate(False)

        tk.Label(left, text='LAYER', bg=PANEL, fg=ACCENT,
                 font=('Arial', 11, 'bold')).pack(anchor='w', padx=12, pady=(15,6))
        tk.Label(left, text='Doppelklick: ein-/ausblenden\nOben = oberste Ebene',
                 bg=PANEL, fg=MUTED, justify='left', font=('Arial',9)).pack(anchor='w',padx=12,pady=(0,9))
        self.layer_tree = ttk.Treeview(left, columns=('visible','type'), show='tree headings',
                                       selectmode='browse', height=10)
        # Tk treeview nutzt #0 für den Namen.
        self.layer_tree.configure(show='tree headings')
        self.layer_tree.heading('#0', text='Datei / Layer')
        self.layer_tree.column('#0', width=160, minwidth=85, stretch=True)
        self.layer_tree.heading('visible', text='An')
        self.layer_tree.column('visible', width=38, anchor='center', stretch=False)
        self.layer_tree.heading('type', text='Typ')
        self.layer_tree.column('type', width=54, anchor='center', stretch=False)
        self.layer_tree.pack(fill='x', expand=False, padx=9)
        self.layer_tree.bind('<Double-1>', self._toggle)
        button_box = tk.Frame(left, bg=PANEL)
        button_box.pack(fill='x', padx=7, pady=(9,12))
        for idx,(label, callback) in enumerate([('An/Aus', self._toggle),('Entfernen',self._remove),
                                ('▲ nach oben',lambda:self._move(-1)),('▼ nach unten',lambda:self._move(1))]):
            ttk.Button(button_box, text=label, command=callback).grid(
                row=idx//2, column=idx%2, sticky='ew', padx=2, pady=2)
        button_box.grid_columnconfigure(0, weight=1)
        button_box.grid_columnconfigure(1, weight=1)

        tk.Label(left, text='FESTES RASTER', bg=PANEL, fg=ACCENT,
                 font=('Arial', 11, 'bold')).pack(anchor='w', padx=12, pady=(8,5))
        self.grid_info = tk.Label(left, bg=PANEL, fg=MUTED, justify='left',
                                  anchor='nw', font=('Courier',10), wraplength=245)
        self.grid_info.pack(fill='x', padx=12)
        self._update_grid_info()
        tk.Label(left, text='Karten dürfen über das Raster hinausgehen.\nMesswertabfrage nur innerhalb des Rasters.',
                 bg=PANEL, fg=MUTED, justify='left', font=('Arial',9)).pack(anchor='w',padx=12,pady=15)

        self.canvas = tk.Canvas(center, bg='#111b25', highlightthickness=1,
                                highlightbackground='#344b5a', cursor='crosshair')
        self.canvas.pack(fill='both', expand=True)
        self.canvas.bind('<Configure>', self._resize)
        self.canvas.bind('<Motion>', self._motion)
        self.canvas.bind('<Leave>', self._leave)
        self.canvas.bind('<ButtonPress-1>', self._drag_start)
        self.canvas.bind('<B1-Motion>', self._drag_motion)
        self.canvas.bind('<ButtonRelease-1>', self._drag_end)
        self.canvas.bind('<MouseWheel>', self._wheel)
        self.canvas.bind('<Button-4>', lambda e:self._zoom(e.x,e.y,1.2))
        self.canvas.bind('<Button-5>', lambda e:self._zoom(e.x,e.y,1/1.2))
        tk.Label(center, text='Rad: auch außerhalb des Rasters zoomen · Ziehen: verschieben · Daten nur im Raster',
                 fg=MUTED, bg=BG, font=('Arial',9)).pack(pady=7)

        tk.Label(right, text='MAUSPOSITION', bg=PANEL, fg=ACCENT,
                 font=('Arial',11,'bold')).pack(anchor='w',padx=13,pady=(15,8))
        self.coordinate_label = tk.Label(right, bg=PANEL, fg=TEXT,
                                         text='Maus über das Raster bewegen',
                                         justify='left', anchor='nw',
                                         font=('Courier',11), wraplength=275)
        self.coordinate_label.pack(anchor='w', fill='x', padx=13, pady=(0,16))
        tk.Frame(right, height=1, bg='#415367').pack(fill='x',padx=13)
        tk.Label(right, text='DATENWERTE AN DIESER POSITION', bg=PANEL, fg=ACCENT,
                 font=('Arial',10,'bold')).pack(anchor='w',padx=13,pady=(15,8))
        self.values = tk.Text(right, bg=PANEL, fg=TEXT, insertbackground=TEXT,
                              borderwidth=0, highlightthickness=0, wrap='word',
                              font=('Courier',10), state='disabled')
        self.values.pack(fill='both', expand=True, padx=12,pady=(0,12))
        self.status_var = tk.StringVar(value='Festes Raster bereit – importiere eine Karte oder Messdaten.')
        tk.Label(self, textvariable=self.status_var, bg=BG, fg=MUTED,
                 anchor='w', font=('Arial',10)).pack(fill='x',padx=13,pady=(0,9))

    def _update_grid_info(self):
        g = self.grid_spec
        self.grid_info.configure(text=(
            f'X: 0 .. {g.columns-1}\nY: 0 .. {g.rows-1}\n'
            f'Zellgröße: {g.cell_size_m:g} m\n'
            f'Ausdehnung: {g.width_m/1000:g} × {g.height_m/1000:g} km\n'
            f'Referenz (Mitte):\n  Lat {g.reference_latitude:.5f}°\n'
            f'  Lon {g.reference_longitude:.5f}°E'
        ))

    def _selected_index(self):
        sel = self.layer_tree.selection()
        return int(sel[0]) if sel else None

    def _update_list(self, select_index=None):
        self.layer_tree.delete(*self.layer_tree.get_children())
        for idx, layer in enumerate(self.layers):
            self.layer_tree.insert('', 'end', iid=str(idx), text=layer.name,
                                   values=('●' if layer.visible else '○',
                                           {'map':'Karte','raster':'Raster','csv':'CSV'}[layer.kind]))
        if select_index is not None and 0<=select_index<len(self.layers):
            self.layer_tree.selection_set(str(select_index))

    def _toggle(self, event=None):
        idx = self._selected_index()
        if idx is None: return
        self.layers[idx].visible = not self.layers[idx].visible
        self._update_list(idx)
        self._schedule_render()
        if self.last_mouse is not None: self._schedule_hover()

    def _move(self, step):
        idx = self._selected_index()
        if idx is None: return
        to = idx + step
        if not 0<=to<len(self.layers): return
        self.layers[idx],self.layers[to]=self.layers[to],self.layers[idx]
        self._update_list(to)
        self._schedule_render()

    def _remove(self):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft','Layer/Raster während des Exports nicht verändern.')
            return
        idx = self._selected_index()
        if idx is None: return
        layer = self.layers.pop(idx)
        if layer.kind=='map':
            layer.source.close()
        else:
            # Datenlayer auch aus Mapper entfernen.
            self.mapper.layers.remove(layer.source)
            if isinstance(layer.source, GeoRaster): layer.source.close()
        self._update_list()
        self._schedule_render()
        if self.last_mouse is not None: self._schedule_hover()

    def _import_layer(self, path:Path, kind: str, *, radius=1200.0):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft','Layer/Raster während des Exports nicht verändern.')
            return
        obj = None
        try:
            self.status_var.set(f'Lade {path.name} und ordne ihn geografisch zu ...')
            self.update_idletasks()
            if kind == 'map':
                obj = GeoRaster(path)
                _check_mars_crs(obj.crs)
                preview = None
            elif kind == 'raster':
                obj = self.mapper.add_tiff(path)
                _check_mars_crs(obj.crs)
                preview = None
            else:
                obj = self.mapper.add_csv(path, nearest_radius_m=radius)
                preview = None
            self.layers.insert(0, DisplayLayer(path.stem, kind, obj, preview))
            self._update_list(0)
            self._schedule_render()
            warning = getattr(obj, 'semantic_warning', '')
            self.status_var.set(f'Geladen: {path.name} | Mit „Layer komplett“ gesamten Layer anzeigen.' + (f' Achtung: {warning}' if warning else ''))
        except Exception as exc:
            if obj is not None:
                if kind!='map' and obj in self.mapper.layers: self.mapper.layers.remove(obj)
                if isinstance(obj,GeoRaster): obj.close()
            messagebox.showerror('Layer konnte nicht geladen werden', f'{path.name}\n\n{exc}')
            self.status_var.set('Import fehlgeschlagen – siehe Fehlermeldung.')

    def _add_map(self):
        files = filedialog.askopenfilenames(title='Mars-Kartenbilder als GeoTIFF öffnen',
                   filetypes=[('GeoTIFF', '*.tif *.tiff'),('Alle Dateien','*.*')])
        for f in files: self._import_layer(Path(f),'map')

    def _add_raster(self):
        files = filedialog.askopenfilenames(title='Numerische GeoTIFF-Daten hinzufügen',
                   filetypes=[('GeoTIFF','*.tif *.tiff'),('Alle Dateien','*.*')])
        for f in files: self._import_layer(Path(f),'raster')

    def _add_csv(self):
        files = filedialog.askopenfilenames(title='JMARS-CSV-Messdaten hinzufügen',
                                           filetypes=[('CSV','*.csv'),('Alle Dateien','*.*')])
        if not files: return
        radius = simpledialog.askfloat('CSV-Suchradius',
                'Maximaler Abstand zum nächsten Messpunkt (Meter):\n'
                'Dies ist keine Interpolation.', initialvalue=1200., minvalue=0.1,
                parent=self)
        if radius is None: return
        for f in files: self._import_layer(Path(f),'csv',radius=radius)

    def _reload_config(self):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft', 'Raster während des Exports nicht verändern.')
            return
        try:
            new_grid = self._read_grid()
            self._apply_grid(new_grid)
            self.status_var.set('fixed_grid.json neu geladen. Raster bleibt unabhängig von allen Karten.')
        except Exception as exc:
            messagebox.showerror('Raster-Konfiguration ungültig',str(exc))

    def _apply_grid(self, grid:LocalMetricGrid):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft','Layer/Raster während des Exports nicht verändern.')
            return
        # Geografischer Anker und Rastergröße wechseln; Layer bleiben erhalten.
        self.grid_spec=grid
        self.mapper.set_fixed_grid(grid)
        self.viewport=Viewport(grid.columns,grid.rows,
                               max(1,self.canvas.winfo_width()), max(1,self.canvas.winfo_height()))
        self._update_grid_info()
        self._set_values('')
        self._fit()

    def _config_dialog(self):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft', 'Raster während des Exports nicht verändern.')
            return
        g=self.grid_spec
        dialog=tk.Toplevel(self)
        dialog.title('Feste Rasterreferenz bearbeiten')
        dialog.configure(bg=PANEL)
        dialog.transient(self)
        dialog.grab_set()
        fields=[('Latitude Referenz (° N)',g.reference_latitude),
                ('Longitude Referenz (° E)',g.reference_longitude),
                ('Zellgröße (Meter)',g.cell_size_m),
                ('Spalten (X)',g.columns),('Zeilen (Y)',g.rows),
                ('Mars-Radius (Meter)',g.mars_radius_m)]
        entries=[]
        for idx,(label,value) in enumerate(fields):
            tk.Label(dialog,text=label,bg=PANEL,fg=TEXT,font=('Arial',10)).grid(
                row=idx,column=0,padx=13,pady=8,sticky='w')
            inp=ttk.Entry(dialog,width=22)
            inp.insert(0,str(value))
            inp.grid(row=idx,column=1,padx=13,pady=8)
            entries.append(inp)
        tk.Label(dialog,text='Referenzposition: Immer Rastermitte\nRasterursprung: Links oben (0,0)',
                 bg=PANEL,fg=ACCENT,justify='left').grid(row=6,column=0,columnspan=2,pady=12)
        def save():
            try:
                v=[float(e.get().strip().replace(',','.')) for e in entries]
                if int(v[3]) !=v[3] or int(v[4])!=v[4]:
                    raise ValueError('Spalten und Zeilen müssen ganze Zahlen sein.')
                grid=LocalMetricGrid(reference_latitude=v[0],reference_longitude=v[1],
                    reference_position='center',cell_size_m=v[2],columns=int(v[3]),
                    rows=int(v[4]),mars_radius_m=v[5])
                self._apply_grid(grid)
                grid.save(self.config_path)
                dialog.destroy()
                self.status_var.set('Rasterreferenz gespeichert: fixed_grid.json')
            except Exception as exc:
                messagebox.showerror('Ungültige Rasterdaten',str(exc),parent=dialog)
        ttk.Button(dialog,text='Speichern und anwenden',command=save).grid(
            row=7,column=0,columnspan=2,pady=(3,14))
        dialog.wait_window()

    def _export_data(self):
        """Exportiert ALLE geladenen Quellen (auch ausgeblendete) ins feste Raster.

        In einem Worker-Thread, damit der Mac-GUI-Eventloop ansprechbar bleibt.
        Währenddessen keine Änderungen an Layern oder Raster vornehmen.
        """
        if getattr(self, '_export_active', False):
            messagebox.showinfo('Export läuft', 'Es läuft bereits ein Datenexport.')
            return
        if not self.layers:
            messagebox.showinfo('Keine Layer', 'Bitte zuerst GeoTIFF- oder CSV-Daten laden.')
            return
        output = filedialog.askdirectory(title='Zielordner für den zugeschnittenen Datenbestand')
        if not output:
            return
        include_csv = messagebox.askyesno(
            'Zusätzliche Raster-CSV-Dateien?',
            'Auch für jeden numerischen Layer eine CSV mit X/Y, Latitude/Longitude '
            'und Messwerten erzeugen?\n\n'
            'Ja: GeoTIFF + Raster-CSV (mehr Speicherbedarf).\n'
            'Nein: GeoTIFF, Originalpunkt-CSV bei JMARS und Metadaten.', parent=self)
        chosen = [ExportLayer(l.name, l.kind, l.source) for l in self.layers]
        grid = self.grid_spec
        self._export_active = True
        self.status_var.set(f'Analysiere {len(chosen)} Layer – feste Rastergrenzen ...')

        notifications = queue.Queue()

        def report(message):
            notifications.put(('progress', message))

        def worker():
            try:
                result = export_region(grid, chosen, output, export_grid_csv=include_csv,
                                       progress=report)
            except Exception as exc:
                notifications.put(('failed', str(exc)))
            else:
                notifications.put(('success', result))

        def poll():
            done = False
            while True:
                try:
                    kind, payload = notifications.get_nowait()
                except queue.Empty:
                    break
                if kind == 'progress':
                    self.status_var.set(payload)
                elif kind == 'failed':
                    done = True
                    finish(False, payload)
                elif kind == 'success':
                    done = True
                    finish(True, payload)
            if not done:
                self.after(100, poll)

        def finish(ok, payload):
            self._export_active = False
            if ok:
                count = len(payload['layers'])
                failed = len(payload['errors'])
                self.status_var.set(f'Zugeschnitten: {count} Layer, {failed} Fehler. Ordner: {output}')
                text = (f'Datenexport abgeschlossen.\n\n'
                        f'Erfolgreich: {count}\nFehler: {failed}\n\n'
                        f'Ziel: {output}\n\n'
                        'Siehe manifest.json und analysis_summary.csv.')
                if failed:
                    text += '\n\nFehlerdetails:\n' + '\n'.join(
                        str(e['name']) + ': ' + str(e['error']) for e in payload['errors'][:6])
                messagebox.showwarning('Datenanalyse – Teilweise erfolgreich', text) if failed else \
                    messagebox.showinfo('Datenanalyse – Export fertig', text)
            else:
                self.status_var.set('Datenexport fehlgeschlagen.')
                messagebox.showerror('Export fehlgeschlagen', payload)

        threading.Thread(target=worker, daemon=True, name='MarsRegionExport').start()
        self.after(100, poll)

    def _load_demo(self):
        demo=self.project_dir/'demo'
        if not (demo/'gale_map.tif').exists():
            messagebox.showinfo('Demo fehlt','Im Terminal zuerst ausführen:\npython3 make_demo_data.py')
            return
        if self.layers:
            if not messagebox.askyesno('Demo laden','Bisherige Layer entfernen und Demo laden?'):
                return
            while self.layers:
                self.layer_tree.selection_set(str(0))
                self._remove()
        for path,kind in [
            (demo/'gale_map.tif','map'),(demo/'gale_elevation.tif','raster'),
            (demo/'gale_thermal.csv','csv')]:
            self._import_layer(path,kind,radius=2500)
        self.status_var.set('DEMO geladen – ALLE Demo-Messwerte sind erfunden (keine NASA-Daten).')

    def _resize(self,event):
        self.viewport.resize(event.width,event.height)
        self._schedule_render()

    def _fit(self):
        self.viewport=Viewport(self.grid_spec.columns,self.grid_spec.rows,
                               max(2,self.canvas.winfo_width()),max(2,self.canvas.winfo_height()))
        self._schedule_render()

    def _fit_layer(self):
        """Ausgewählten Layer vollständig zeigen, ohne das feste Raster zu verändern."""
        idx=self._selected_index()
        if idx is None:
            idx=next((i for i,l in enumerate(self.layers) if l.visible),None)
        if idx is None:
            self._fit()
            return
        lyr=self.layers[idx]
        try:
            if lyr.kind=='csv':
                left,top,right,bottom=csv_layer_bounds(lyr.source,self.grid_spec)
            else:
                left,top,right,bottom=geo_tiff_layer_bounds(lyr.source,self.grid_spec)
            # Feste Rasterbegrenzung immer mit einpassen, sofern der Layer
            # in erreichbarer Nähe liegt. Auch disjunkte Quellen zeigen so,
            # wo sie relativ zum A*-Raster liegen.
            left=min(left,0.0); top=min(top,0.0)
            right=max(right,float(self.grid_spec.columns))
            bottom=max(bottom,float(self.grid_spec.rows))
            pad_w=max(1.0,(right-left)*.045)
            pad_h=max(1.0,(bottom-top)*.045)
            v=self.viewport
            v.center_col=(left+right)/2
            v.center_row=(top+bottom)/2
            v.scale=min(40.0,max(1e-5,min(v.canvas_w/(right-left+2*pad_w),
                                             v.canvas_h/(bottom-top+2*pad_h))))
            self.status_var.set(f'Gesamter Layer: {lyr.name} | Messwerte nur im festen Raster.')
            self._schedule_render()
        except Exception as exc:
            messagebox.showerror('Layer-Ausdehnung',str(exc))

    def _constrain(self):
        # Panning außerhalb des festen Rasters ist zur Ansicht größerer
        # GeoTIFFs ausdrücklich erlaubt. Das Raster selbst bewegt sich nie.
        pass

    def _zoom(self,x,y,factor):
        self.viewport.zoom_at(x,y,factor)
        self._constrain()
        self._schedule_render()
        return 'break'

    def _wheel(self,event):
        if event.delta:
            self._zoom(event.x,event.y,1.2 if event.delta>0 else 1/1.2)
        return 'break'

    def _drag_start(self,event): self.drag_xy=(event.x,event.y)
    def _drag_motion(self,event):
        if self.drag_xy is None:return
        x,y=self.drag_xy
        self.viewport.pan_by_screen_pixels(event.x-x,event.y-y)
        self.drag_xy=(event.x,event.y)
        self._constrain()
        self._schedule_render()
    def _drag_end(self,event):
        self.drag_xy=None
        self._motion(event)

    def _schedule_render(self):
        if self.render_job is not None:
            self.after_cancel(self.render_job)
        self.render_job=self.after(30,self._render)

    def _render(self):
        self.render_job=None
        v=self.viewport
        w,h=max(2,v.canvas_w),max(2,v.canvas_h)
        back=Image.new('RGBA',(w,h),(15,27,37,255))
        left,top=v.screen_to_raster(0,0)
        right,bottom=v.screen_to_raster(w,h)
        bounds=(left,top,right,bottom)
        # Die Quelle wird direkt auf die sichtbare Viewportfläche abgebildet.
        # Die Ansicht ist NICHT auf 0..columns/rows zugeschnitten.
        # Die tatsächliche Messwertabfrage bleibt auf das feste Raster begrenzt.
        for layer in reversed(self.layers):
            if not layer.visible:continue
            try:
                if layer.kind=='csv':
                    placement=csv_point_preview_window(layer.source,self.grid_spec,bounds,w,h)
                else:
                    placement=geo_tiff_preview_window(layer.source,self.grid_spec,
                         bounds,w,h,heatmap=(layer.kind=='raster'))
                back=Image.alpha_composite(back,placement)
            except Exception as exc:
                self.status_var.set(f'Darstellung von {layer.name} fehlgeschlagen: {exc}')
        self.photo=ImageTk.PhotoImage(back.convert('RGB'))
        c=self.canvas
        c.delete('all')
        c.create_image(0,0,anchor='nw',image=self.photo)
        x0,y0=v.raster_to_screen(0,0)
        x1,y1=v.raster_to_screen(self.grid_spec.columns,self.grid_spec.rows)
        if x1<=0 or x0>=w or y1<=0 or y0>=h:return
        c.create_rectangle(x0,y0,x1,y1,outline=GRID,width=2)
        # Gitterlinien in festen Rasterindizes (nicht Pixelkoordinaten des GeoTIFFs).
        step_x=self._tick(self.grid_spec.columns)
        step_y=self._tick(self.grid_spec.rows)
        for x in range(0,self.grid_spec.columns+1,step_x):
            sx, _=v.raster_to_screen(x,0)
            if 0<=sx<=w:
                c.create_line(sx,max(0,y0),sx,min(h,y1),fill='#43ad9d',dash=(2,5),width=1)
                if 0<=y0<h:
                    c.create_text(sx+3,y0+10,text=str(x),fill='#dff9f4',anchor='nw',font=('Arial',9))
        for y in range(0,self.grid_spec.rows+1,step_y):
            _, sy=v.raster_to_screen(0,y)
            if 0<=sy<=h:
                c.create_line(max(0,x0),sy,min(w,x1),sy,fill='#43ad9d',dash=(2,5),width=1)
                if 0<=x0<w:
                    c.create_text(x0+5,sy+2,text=str(y),fill='#dff9f4',anchor='nw',font=('Arial',9))
        if 0<=x0<w and 0<=y0<h:
            c.create_rectangle(x0-2,y0-2,x0+2,y0+2,fill=GRID,outline='')
            c.create_text(x0+6,y0-10,text='(0,0)',fill='#f7fffc',anchor='sw',
                          font=('Arial',11,'bold'))
        cx,cy=v.raster_to_screen(self.grid_spec.columns/2,self.grid_spec.rows/2)
        if 0<=cx<=w and 0<=cy<=h:
            c.create_line(cx-10,cy,cx+10,cy,fill='#ffe1a2',width=2)
            c.create_line(cx,cy-10,cx,cy+10,fill='#ffe1a2',width=2)
            c.create_text(cx+12,cy-12,text='Referenzpunkt',anchor='sw',
                          fill='#ffe1a2',font=('Arial',9,'bold'))
        if self.last_mouse is not None:
            self._draw_hover_outline(*self.last_mouse)

    @staticmethod
    def _tick(length):
        target=max(1,length/9)
        base=10**int(math.floor(math.log10(target)))
        return min((1,2,5,10),key=lambda f: abs(f*base-target))*base

    def _draw_hover_outline(self,sx,sy):
        col,row=self.viewport.screen_to_raster(sx,sy)
        if not 0<=col<self.grid_spec.columns or not 0<=row<self.grid_spec.rows:return
        c,r=int(col),int(row)
        x0,y0=self.viewport.raster_to_screen(c,r)
        x1,y1=self.viewport.raster_to_screen(c+1,r+1)
        if x1-x0>=3 and y1-y0>=3:
            self.canvas.create_rectangle(x0,y0,x1,y1,outline='#ffe2a3',width=1.5,tags='hover')

    def _motion(self,event):
        self.last_mouse=(event.x,event.y)
        self.canvas.delete('hover')
        self._draw_hover_outline(event.x,event.y)
        self._schedule_hover()

    def _schedule_hover(self):
        if self.hover_job is not None:self.after_cancel(self.hover_job)
        self.hover_job=self.after(55,self._inspect)

    def _inspect(self):
        self.hover_job=None
        if self.last_mouse is None:return
        sx,sy=self.last_mouse
        col,row=self.viewport.screen_to_raster(sx,sy)
        g=self.grid_spec
        if not(0<=col<g.columns and 0<=row<g.rows):
            self.coordinate_label.configure(text='Außerhalb des festen Rasters')
            self._set_values('')
            return
        x,y=int(col),int(row)
        lon,lat=g._from_local(col*g.cell_size_m,row*g.cell_size_m)
        self.coordinate_label.configure(text=f'Raster X: {x}\nRaster Y: {y}\n\n'
                   f'Latitude:  {lat:.6f}°\nLongitude: {lon:.6f}° E\n\n'
                   f'Zelle: {g.cell_size_m:g} × {g.cell_size_m:g} m')
        results=[]
        source_crs=CRS.from_user_input(MARS_SPHERE_GEO_CRS)
        for layer in self.layers:
            if layer.kind=='map' or not layer.visible:continue
            hit=layer.source.sample(source_crs,lon,lat)
            results.append(f'▣ {layer.name}\n')
            if hit.status=='ok':
                for key,value in hit.values.items():
                    results.append(f'  {key}: {value:.7g}{(" "+hit.unit) if hit.unit else ""}\n')
            else:
                results.append(f'  {hit.status}\n')
            if hit.detail:results.append(f'  {hit.detail}\n')
            results.append('\n')
        self._set_values(''.join(results) if results else 'Noch keine sichtbaren Messdaten geladen.\n\n'
                         'Importiere eine JMARS-CSV oder ein numerisches GeoTIFF.')

    def _set_values(self, content):
        self.values.configure(state='normal')
        self.values.delete('1.0','end')
        self.values.insert('1.0',content)
        self.values.configure(state='disabled')

    def _leave(self,event):
        self.last_mouse=None
        self.coordinate_label.configure(text='Maus über das Raster bewegen')
        self._set_values('')
        self.canvas.delete('hover')

    def _close(self):
        if getattr(self, '_export_active', False):
            messagebox.showwarning('Export läuft','Bitte Datenexport erst abschließen lassen.')
            return
        for layer in self.layers:
            if layer.kind=='map':layer.source.close()
        self.mapper.close()
        self.destroy()


def main(directory:Path):
    MapWindow(directory).mainloop()

import json,urllib.request,csv
def get(u): return json.load(urllib.request.urlopen(u,timeout=60))
rows=[]
for e,name in (("11","Guanajuato"),("22","Querétaro")):
    for m in get(f"https://gaia.inegi.org.mx/wscatgeo/v2/mgem/{e}")['datos']:
        g=get(f"https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/{m['cvegeo']}")['features'][0]['geometry']
        polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        A=cx=cy=0
        for p in polys:
            r=p[0]
            for (x0,y0),(x1,y1) in zip(r,r[1:]+r[:1]):
                c=x0*y1-x1*y0;A+=c;cx+=(x0+x1)*c;cy+=(y0+y1)*c
        # area-weighted ring centroid; holes ignored, sign-agnostic
        pass
        rows.append((m['cvegeo'],name,m['nomgeo'],round(cy/(3*A),4),round(cx/(3*A),4)))
    print(name,len(rows))
w=csv.writer(open('ex/municipios_centroides_inegi.csv','w',newline='',encoding='utf8'));w.writerow(['cvegeo','estado','municipio','lat','lon']);w.writerows(rows)

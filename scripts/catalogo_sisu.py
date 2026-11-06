import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Reproduz o catálogo agregado a partir dos quatro PDFs oficiais. Requer PyMuPDF.')
parser.add_argument('fontes', type=Path, help='Diretório com os quatro PDFs, nomeados como os ids do manifesto.')
FONTES = parser.parse_args().fontes.resolve()
SAIDA = ROOT / 'frontend/public/catalogo-sisu.json'
URLS = {
 'ufc-termo-2026': 'https://sisu.ufc.br/wp-content/uploads/2025/12/termo-de-adesao-ufc-sisu-2026.pdf',
 'ufc-cortes-2025': 'https://sisu.ufc.br/wp-content/uploads/2025/12/notas-de-corte-sisu-ufc-2025.pdf',
 'ufmg-termo-2026': 'https://www.ufmg.br/sisu/wp-content/uploads/2026/01/termo_adesao_575_UFMG-16-ASSINADO.pdf',
 'ufmg-cortes-2026': 'https://www.ufmg.br/sisu/wp-content/uploads/2026/02/Notas-maximas-e-minimas.pdf',
}
MODS = {'AC':'Ampla concorrência','LI_EP':'Escola pública · independentemente de renda','LI_PCD':'Escola pública · pessoa com deficiência · independentemente de renda','LI_Q':'Escola pública · quilombola · independentemente de renda','LI_PPI':'Escola pública · pessoa preta, parda ou indígena · independentemente de renda','LB_EP':'Escola pública · baixa renda','LB_PCD':'Escola pública · pessoa com deficiência · baixa renda','LB_Q':'Escola pública · quilombola · baixa renda','LB_PPI':'Escola pública · pessoa preta, parda ou indígena · baixa renda','V1':'Reserva da instituição · pessoas surdas (Letras-Libras)'}

def normal(s):
 return re.sub(r'\s+', ' ', ''.join(c for c in unicodedata.normalize('NFD',s.upper()) if unicodedata.category(c)!='Mn')).strip()

def numero(s): return float(s.replace('.','').replace(',','.'))

def termos(sigla):
 cursos=[]
 for i,p in enumerate(pymupdf.open(FONTES/f'{sigla}-termo-2026.pdf')):
  t=p.get_text()
  if 'Prova do Enem' not in t or 'Quadro de vagas ofertadas no curso' not in t: continue
  local=re.search(r'Local de Oferta:\s*(\d+) - (.+?) \((.+?), ([A-Z]{2})\)',t)
  titulo=re.search(r'\n(\d+) - ([^\n]+)\n',t)
  if not local or not titulo: raise ValueError(f'Local/título {sigla} p{i+1}')
  antes=t.split('Prova do Enem')[0]
  turno=re.search(r'\n\s*([^\n]+)\nTurno:',antes)
  if not turno: turno=re.search(r'Turno:\s*([^\n]+)',antes)
  assert turno,(sigla,i)
  tabela=t.split('Prova do Enem')[1].split('PERCENTUAIS')[0]
  nums=re.findall(r'\b\d+,\d{2}\b',tabela)
  assert len(nums)==11,(sigla,i,nums)
  vals=list(map(numero,nums))
  areas=['RED','CN','CH','LC','MT']
  pesos=dict(zip(areas,vals[0:10:2]));minimos=dict(zip(areas,vals[1:10:2]))
  vagas=t.split('Quadro de vagas ofertadas no curso')[1]
  modalidades=[(a,int(b)) for a,b in re.findall(r'\b(AC|LI_EP|LI_PCD|LI_Q|LI_PPI|LB_EP|LB_PCD|LB_Q|LB_PPI|V1)\s*\n\s*(\d+)\s*\n',vagas)]
  if not modalidades: raise ValueError(f'Sem quadro {sigla} {i+1}')
  cursos.append(dict(sigla=sigla.upper(),codigo=titulo[1],nome=titulo[2].strip(),campus=local[2],municipio=local[3],uf=local[4],turno=turno[1].strip(),pesos=pesos,minimos=minimos,mediaMinima=vals[10],pagina=i+1,modalidades=modalidades))
 return cursos

def cortes_ufc():
 rows={}
 for i,p in enumerate(pymupdf.open(FONTES/'ufc-cortes-2025.pdf')):
  for table in p.find_tables().tables:
   for row in table.extract():
    if len(row)!=8 or not re.fullmatch(r"\d{4,8}",row[0] or ''):continue
    codigo,sede,campus,curso,grau,turno,mod,nota=[re.sub(r"\s+"," ",x or '').strip() for x in row]
    mod=re.sub(r'[^A-Z0-9]','',mod)
    if mod not in ('AC','V1'):mod=mod[:2]+'_'+mod[2:]
    assert mod in MODS,(i,row)
    key=(codigo,normal(turno),mod)
    val=None if normal(nota)=='NAO SE APLICA' else numero(nota)
    assert key not in rows,(key,i)
    rows[key]=(val,i+1)
 return rows

def cortes_ufmg():
 rows={}
 for i,p in enumerate(pymupdf.open(FONTES/'ufmg-cortes-2026.pdf')):
  for table in p.find_tables().tables:
   for row in table.extract():
    if len(row)!=5 or not re.fullmatch(r"\d+,\d{2}",row[3] or ''):continue
    nome,turno,mod,nota,maximo=[re.sub(r"\s+"," ",x or '').strip() for x in row]
    mod='AC' if normal(mod)=='AMPLA CONCORRENCIA' else re.sub(r'[^A-Z]','',mod)
    if mod!='AC':mod=mod[:2]+'_'+mod[2:]
    assert mod in MODS,(i,row)
    key=(normal(nome),normal(turno),mod)
    assert key not in rows,(key,i)
    rows[key]=(numero(nota),i+1)
 return rows

def gerar():
 manifesto=json.loads(SAIDA.read_text(encoding='utf-8'))['fontes']
 for f in manifesto:
  assert hashlib.sha256((FONTES/(f['id']+'.pdf')).read_bytes()).hexdigest()==f['sha256'],f
 cursos=termos('ufc')+termos('ufmg')
 assert collections.Counter(c['sigla'] for c in cursos)=={'UFC':110,'UFMG':94}
 cufc=cortes_ufc();cmg=cortes_ufmg()
 print('Cursos',collections.Counter(c['sigla'] for c in cursos),'Cortes',len(cufc),len(cmg))
 ofertas=[];sem=[]
 for c in cursos:
  for mod,vagas in c['modalidades']:
   if not vagas:continue
   s=c['sigla'].lower()
   if s=='ufc':
    # The 2025 cutoff PDF uses Integral for the detailed Integral (Matutino/Vespertino) shift.
    turno=normal(c['turno'].split(' (')[0]);ref=cufc.get((c['codigo'],turno,mod))
   else:
    nome=normal(re.sub(r'^ABI - ','',c['nome']))
    if c['municipio']=='Montes Claros':nome+=' (MONTES CLAROS)'
    ref=cmg.get((nome,normal(c['turno'].split(' (')[0]),mod))
   if ref is None:sem.append((c['sigla'],c['nome'],c['turno'],mod))
   ano=2025 if s=='ufc' else 2026
   ident=f'{s}-2026-{c["codigo"]}-{normal(c["turno"]).split()[0].lower()}-{mod.lower()}'
   origem={'id':ident,'sigla':c['sigla'],'codigoCurso':c['codigo'],'modalidadeCodigo':mod,'municipio':c['municipio'],'anoRegras':2026,'vagas':vagas,'fonteRegras':URLS[f'{s}-termo-2026'],'paginaRegras':c['pagina'],'fonteReferencia':URLS[f'{s}-cortes-{ano}'] if ref else '', 'paginaReferencia':ref[1] if ref else None,'coletadoEm':'2026-11-05','personalizada':False}
   ofertas.append(dict(id=ident,nome=c['nome'],instituicao='Universidade Federal do Ceará (UFC)' if s=='ufc' else 'Universidade Federal de Minas Gerais (UFMG)',campus=c['campus'],uf=c['uf'],modalidade=f'{mod} · {MODS[mod]}',turno=c['turno'],pesos=c['pesos'],minimos=c['minimos'],mediaMinima=c['mediaMinima'],bonus=0,referencia=ref[0] if ref else None,anoReferencia=ano,tipoReferencia='historico',fonte=URLS[f'{s}-cortes-{ano}'] if ref else URLS[f'{s}-termo-2026'],exemplo=False,catalogo=origem))
 assert len(ofertas)==1634
 assert sum(o['referencia'] is not None for o in ofertas)==1375
 assert len({o['id'] for o in ofertas})==len(ofertas)
 assert all(len(o['pesos'])==5 and len(o['minimos'])==5 and sum(o['pesos'].values())>0 for o in ofertas)
 fontes=[dict(id=k,url=v,sha256=hashlib.sha256((FONTES/f'{k}.pdf').read_bytes()).hexdigest()) for k,v in URLS.items()]
 data=dict(versao=1,atualizadoEm='2026-11-05',cobertura='UFC e UFMG · regras Sisu 2026; referências da chamada regular UFC 2025 e UFMG 2026',fontes=fontes,ofertas=sorted(ofertas,key=lambda o:(normal(o['nome']),o['catalogo']['sigla'],o['campus'],o['turno'],o['modalidade'])))
 compactos={}
 for o in data['ofertas']:
  cat=o['catalogo'];prefixo=o['id'].rsplit('-',1)[0]
  if prefixo not in compactos:
   compactos[prefixo]={k:o[k] for k in ['nome','instituicao','campus','uf','turno','pesos','minimos','mediaMinima','anoReferencia']}
   compactos[prefixo].update(id=prefixo,sigla=cat['sigla'],codigoCurso=cat['codigoCurso'],municipio=cat['municipio'],paginaRegras=cat['paginaRegras'],fonteRegras=next(i for i,f in enumerate(fontes) if f['url']==cat['fonteRegras']),fonteReferencia=1 if cat['sigla']=='UFC' else 3,modalidades=[])
  compactos[prefixo]['modalidades'].append([cat['modalidadeCodigo'],cat['vagas'],o['referencia'],cat['paginaReferencia']])
 data.pop('ofertas');data['cursos']=list(compactos.values());data['modalidades']=MODS
 SAIDA.parent.mkdir(parents=True,exist_ok=True);SAIDA.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 iniciais=['ufc-2026-13980-integral-ac','ufmg-2026-12970-integral-ac','ufmg-2026-12941-noturno-ac','ufc-2026-13986-integral-ac','ufmg-2026-12954-matutino-ac','ufc-2026-1571410-integral-ac']
 por_id={o['id']:o for o in ofertas}
 (SAIDA.parents[1]/'src/catalogo-inicial.json').write_text(json.dumps([por_id[i] for i in iniciais],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (FONTES/'sem-referencia.json').write_text(json.dumps(sem,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Ofertas',len(ofertas),'Com referência',sum(o['referencia'] is not None for o in ofertas),'sem vínculo',len(sem),'cursos/turnos',len(compactos))

if __name__=='__main__':gerar()

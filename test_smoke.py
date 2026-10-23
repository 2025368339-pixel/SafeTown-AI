"""Lightweight, end-to-end backend smoke test; run with python test_smoke.py."""
import io
from PIL import Image
from fastapi.testclient import TestClient
from server import app

a = TestClient(app)
r = TestClient(app)

assert a.get('/api/health').status_code == 200
assert a.get('/api/dashboard').status_code == 401
assert r.post('/api/auth/login',json={'email':'resident@safetown.test','password':'Resident@12345'}).status_code==200
assert r.get('/api/dashboard').status_code==403
assert a.post('/api/auth/login',json={'email':'admin@safetown.test','password':'Admin@12345'}).status_code==200
assert a.get('/api/dashboard').status_code==200

# Resident chooses the perceived severity; the AI only predicts the category.
response=r.post('/api/reports',data={'zone':'C','description':'Lampu jalan rosak dekat lakeside walkway dan sangat gelap','resident_severity':5})
assert response.status_code==201,response.text
rep=response.json()['report']
assert rep['resident_severity']==5 and rep['verified_severity'] is None
assert rep['category']=='poor_lighting', rep
assert rep['status']=='pending'
report_id=rep['id']
assert r.get(f'/api/reports/{report_id}').status_code==200
assert r.post(f'/api/reports/{report_id}/review',json={'action':'verify','verified_severity':2,'note':'Reviewed site'}).status_code==403

# Correction requires reason; admin must verify and audit the change.
assert a.post(f'/api/reports/{report_id}/review',json={'action':'verify','verified_severity':2,'note':''}).status_code==400
z_before=next(z for z in a.get('/api/zones').json() if z['code']=='C')
response=a.post(f'/api/reports/{report_id}/review',json={'action':'verify','verified_severity':2,'note':'Site reviewed: another nearby lamp remains operational.'})
assert response.status_code==200,response.text
assert response.json()['report']['resident_severity']==5
assert response.json()['report']['verified_severity']==2
assert response.json()['report']['status']=='verified'
z_after=next(z for z in a.get('/api/zones').json() if z['code']=='C')
assert z_after['score']<z_before['score']  # exaggerated severity 5 corrected to 2 lowers current risk
assert a.post(f'/api/reports/{report_id}/review',json={'action':'start','note':'Assign technician'}).status_code==200
assert a.post(f'/api/reports/{report_id}/review',json={'action':'resolve','note':'Technician replaced the broken streetlight.'}).status_code==200
assert a.get(f'/api/reports/{report_id}').json()['report']['status']=='resolved'
assert len(a.get(f'/api/reports/{report_id}').json()['history'])==4
assert r.get('/api/reports/mine').status_code==200

# Evidence is private: resident owns photo; admins may review it.
buffer = io.BytesIO()
Image.new('RGB',(4,4),'orange').save(buffer,format='PNG')
png = buffer.getvalue()
photo=r.post('/api/reports',data={'zone':'A','description':'Pagar rosak dekat kawasan perumahan belakang','resident_severity':3},files={'photo':('evidence.png',png,'image/png')})
assert photo.status_code==201,photo.text
photo_id=photo.json()['report']['id']
assert r.get(f'/api/reports/{photo_id}/photo').status_code==200
assert a.get(f'/api/reports/{photo_id}/photo').status_code==200

# Similar report can be flagged without automatic rejection.
dup=r.post('/api/reports',data={'zone':'A','description':'Pagar rosak dekat kawasan perumahan belakang','resident_severity':3})
assert dup.status_code==201
assert dup.json()['report']['possible_duplicate_of']==photo_id

# Reset leaves the demonstration clean.
assert a.post('/api/demo/reset').status_code==200
assert len(a.get('/api/reports').json())==8
assert a.post('/api/auth/logout').status_code==200
assert a.get('/api/dashboard').status_code==401
print('PASS: health, auth, roles, AI category, resident severity, admin correction, audit, lifecycle, private photo, duplicate flag, reset.')

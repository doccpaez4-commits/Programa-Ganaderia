#!/usr/bin/env python3
"""
Seed script for PaMora Herd — uploads complete herd to Firebase via REST API.
Run: python3 seed_herd_firebase.py
"""
import json
import urllib.request
import urllib.error

PROJECT_ID = 'pamoraleche'
API_KEY = 'AIzaSyDVp5Vph7Li9QsOz4pGc6kFiXASDwC-6vM'
BASE_URL = f'https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents'

herd = [
    {'nombre': 'Moli', 'raza': 'Holstein', 'idAnimal': '', 'fechaNacimiento': '', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Dulce', 'raza': 'Ayrshire', 'idAnimal': '', 'fechaNacimiento': '', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Morocha', 'raza': 'Angus', 'idAnimal': '', 'fechaNacimiento': '', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Miel', 'idAnimal': '2115', 'raza': 'Montbeliarde/Holstein', 'fechaNacimiento': '2023-04-07', 'padre': 'N19', 'madre': '1690-Montbeliarde', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Mapi', 'idAnimal': '2102', 'raza': 'Holstein', 'fechaNacimiento': '2023-01-09', 'padre': 'Porsche 556HO1303', 'madre': '1981', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Hércules/Ranger', 'raza': 'Montbeliarde', 'idAnimal': '', 'fechaNacimiento': '2025-04-29', 'padre': 'Ranger Red 7HO12344', 'madre': 'Miel', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': '11/06/2025 cambio a 5 litros. 23/06/2025 cambio a 4 litros diarios. 24/07/2025 cambio a 2 litros mañana 1 tarde. 29/07/2025 2 litros al día. 4 Agosto se desteto Bambi y Tato, se les compra ración de concentrado.'},
    {'nombre': 'Conny', 'raza': 'Jersey', 'idAnimal': '', 'fechaNacimiento': '2024-11-27', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Martina', 'raza': 'Holstein', 'idAnimal': '', 'fechaNacimiento': '2023-06-26', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vendida', 'status': 'Retirado', 'fechaRetiro': '2026-02-14', 'motivoRetiro': 'Baja Produccion', 'notas': ''},
    {'nombre': 'Sol', 'idAnimal': '2112', 'raza': 'Holstein', 'fechaNacimiento': '2023-03-27', 'padre': 'Gurú 14HO7794', 'madre': '2010', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Nube', 'idAnimal': '2114', 'raza': 'Holstein', 'fechaNacimiento': '2023-03-29', 'padre': 'Gurú 14HO7794', 'madre': '2005', 'registro': '', 'categoria': 'Vaca (Producción)', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Bambi', 'raza': 'Angus', 'idAnimal': '', 'fechaNacimiento': '2025-04-16', 'padre': 'Holstein', 'madre': 'Morocha', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Mandarina', 'raza': 'Normando', 'idAnimal': '', 'fechaNacimiento': '', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vendida', 'status': 'Retirado', 'fechaRetiro': '2026-02-14', 'motivoRetiro': 'Cambio', 'notas': '01/10/2025 aborto, 4 meses aprox.'},
    {'nombre': 'Gurú', 'raza': 'Holstein', 'idAnimal': '', 'fechaNacimiento': '2025-06-13', 'padre': 'Quick Work', 'madre': 'nube', 'registro': '', 'categoria': 'Ternero', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Augusto', 'raza': 'Angus', 'idAnimal': '', 'fechaNacimiento': '2025-06-06', 'padre': '', 'madre': '', 'registro': '', 'categoria': 'Vendida', 'status': 'Retirado', 'fechaRetiro': '2025-06-10', 'motivoRetiro': 'Venta para crianza', 'notas': ''},
    {'nombre': 'Lulu', 'raza': 'Holstein', 'idAnimal': '', 'fechaNacimiento': '2025-06-26', 'padre': 'River Red 17HO16781', 'madre': 'Sol 2112', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': 'destete lulu 15/10/2025 2 tasas de concentrado y una de suplemento por ración'},
    {'nombre': 'Consentida', 'raza': 'Holstein Red', 'idAnimal': '', 'fechaNacimiento': '2025-08-08', 'padre': '', 'madre': 'Moli', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': '24/10/2025 se baja la leche a 2 litros y medio. 01/11/2025 concentrado. destete completo 14/11/2025 2 tazas concentrado'},
    {'nombre': 'MacFly', 'raza': 'Holstein Red', 'idAnimal': '', 'fechaNacimiento': '2025-09-23', 'padre': 'Desconocido', 'madre': 'Martina', 'registro': '', 'categoria': 'Vendida', 'status': 'Retirado', 'fechaRetiro': '', 'motivoRetiro': 'venta para crianza', 'notas': ''},
    {'nombre': 'Chilindrina', 'idAnimal': '2143', 'raza': 'Holstein', 'fechaNacimiento': '2023-12-18', 'padre': 'BUTLER 7HO12195', 'madre': '1881', 'registro': '', 'categoria': 'Próxima parto', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Miel (2159)', 'idAnimal': '2159', 'raza': 'Montbeliarde/Holstein', 'fechaNacimiento': '2024-03-10', 'padre': 'Ranger-Red 7HO12344', 'madre': '1690', 'registro': '', 'categoria': 'Próxima parto', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
    {'nombre': 'Regalo', 'raza': 'Holstein', 'idAnimal': '', 'fechaNacimiento': '2026-02-10', 'padre': 'FOX 0200H010911', 'madre': '2092', 'registro': '', 'categoria': 'Ternera', 'status': 'Activo', 'fechaRetiro': '', 'motivoRetiro': '', 'notas': ''},
]

def to_firestore_fields(data):
    fields = {}
    for k, v in data.items():
        if isinstance(v, str):
            fields[k] = {'stringValue': v}
        elif isinstance(v, bool):
            fields[k] = {'booleanValue': v}
        elif isinstance(v, int):
            fields[k] = {'integerValue': str(v)}
    return fields

def get_doc_id(name):
    return name.replace('/', '_').strip()

def patch_document(collection, doc_id, data):
    url = f'{BASE_URL}/{collection}/{doc_id}?key={API_KEY}'
    body = json.dumps({'fields': to_firestore_fields(data)}).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='PATCH')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def set_config(active_names):
    """Set the config/hato document with animales as array"""
    url = f'{BASE_URL}/config/hato?key={API_KEY}'
    array_values = [{'stringValue': n} for n in active_names]
    body = json.dumps({'fields': {'animales': {'arrayValue': {'values': array_values}}}}).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='PATCH')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def main():
    print(f'Uploading {len(herd)} animals to Firebase Firestore...')
    active_names = []
    errors = []

    for animal in herd:
        doc_id = get_doc_id(animal['nombre'])
        try:
            patch_document('hato_detalle', doc_id, animal)
            if animal['status'] == 'Activo':
                active_names.append(animal['nombre'])
            print(f"✅ {animal['nombre']:<25} → {animal['categoria']}")
        except Exception as e:
            print(f"❌ {animal['nombre']}: {e}")
            errors.append(animal['nombre'])

    print(f'\n--- Updating config/hato with {len(active_names)} active animals ---')
    try:
        set_config(active_names)
        print(f'✅ config/hato updated')
    except Exception as e:
        print(f'❌ config error: {e}')

    print(f'\n✅ Done! Uploaded {len(herd) - len(errors)}/{len(herd)} animals.')
    if errors:
        print(f'❌ Failed: {errors}')
    print(f'Active animals: {active_names}')

main()

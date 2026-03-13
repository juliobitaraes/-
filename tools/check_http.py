import urllib.request
urls=['http://127.0.0.1:8000/','http://127.0.0.1:8000/js/app.js','http://127.0.0.1:8000/js/app-impl.js']
for u in urls:
    try:
        r=urllib.request.urlopen(u, timeout=5)
        data=r.read().decode('utf-8',errors='replace')
        print('URL:', u, 'Status:', r.getcode())
        print('---BEGIN CONTENT PREVIEW---')
        print(data[:800])
        print('---END CONTENT PREVIEW---\n')
    except Exception as e:
        print('URL:',u,'ERROR', e)

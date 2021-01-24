@app
begin-app

@events
fetch-quotes

@http
get /

@tables
data
  scopeID *String
  dataID **String
  ttl TTL

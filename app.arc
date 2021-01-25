@app
begin-app

@events
fetch-quotes

@http
get /
get /quotes

@tables
data
  scopeID *String
  dataID **String
  ttl TTL

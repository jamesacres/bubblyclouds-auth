export const repost = (postBody?: { state: string; code: string }) => `<html>

<head>
  <title>Bubbly Clouds Sign in</title>
</head>

<body>
  <script nonce="<%= nonce %>">
    function parseQuery(queryString) {
      var query = {};
      var pairs = (queryString[0] === '?' ? queryString.slice(1) : queryString).split('&');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      }
      return query;
    }

    var fields = ${JSON.stringify(postBody)} || parseQuery(window.location.hash.slice(1) || window.location.search);
    fields.upstream = '<%= upstream %>'
    var uid = fields.state;

    var form = document.createElement('form');
    form.method = 'POST';
    form.action = '/oidc/interaction/' + uid + '/federated';
    Object.keys(fields).forEach((key) => {
      if (key) { // empty fragment will yield {"":""};
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = fields[key];
        form.appendChild(input);
      }
    });
    document.body.appendChild(form);

    try {
      var url = window.location.href.slice(0, -Math.max(window.location.hash.length, 1));
      window.history.replaceState({}, window.document.title, url);
    } catch (err) {
      window.location.hash = "";
    }

    form.submit();
  </script>
</body>

</html>`;

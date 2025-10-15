export default {
  async fetch(request, env, ctx) {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      const url = new URL(request.url);
      url.pathname = "/index.html";
      return env.ASSETS.fetch(
        new Request(url.toString(), {
          headers: request.headers,
          method: "GET",
        }),
      );
    }
    return response;
  },
};

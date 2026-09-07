// Stand-in for @angular/core so the listener services can be bundled into a
// plain page without the Angular runtime. The services only use @Injectable().
export function Injectable() {
  return function (target) { return target; };
}

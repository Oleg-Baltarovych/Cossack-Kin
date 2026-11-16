// Smoke check: Node 24 runs tools/*.ts via built-in type stripping, without tsx (M0-01).
const greeting: string = 'tools/*.ts runs on Node without tsx';
console.log(greeting);

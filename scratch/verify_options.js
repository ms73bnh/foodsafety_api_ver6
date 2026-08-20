const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/data/options');
  const result = await res.json();
  if (result.success) {
    console.log('Categories found:');
    const categories = new Set(result.functionalities.map(f => f.category));
    console.log(Array.from(categories));
    
    console.log('\nSamples by category:');
    ['NUTRIENTS', 'STANDARDIZED', 'INDIVIDUAL'].forEach(cat => {
      const samples = result.functionalities.filter(f => f.category === cat).slice(0, 5).map(f => f.name);
      console.log(`${cat}: ${samples.join(', ')}`);
    });
  } else {
    console.error('Failed to fetch options', result);
  }
}

test();

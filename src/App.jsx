import { useState } from 'react';

function App() {
    const [status] = useState('Base React preparada');

    return (
        <main aria-label="Evolet Nails React">
            <h1>Evolet Nails</h1>
            <p>{status}</p>
        </main>
    );
}

export default App;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/intern-profile', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
            const data = await response.json();
            document.querySelector('.username').textContent = data.name;
            document.querySelector('.school-id').textContent = `ID: ${data.school_id}`;
        } else {
            console.error('Failed to load profile data');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/school-profile', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
            const data = await response.json();
            document.querySelector('.username').textContent = data.name;
        } else {
            console.error('Failed to load profile data');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});
<script lang="ts">
  import type { Units } from '../lib/units';

  interface Props {
    units: Units;
  }
  const { units }: Props = $props();

  let saving = $state(false);

  async function toggle() {
    const next: Units = units === 'metric' ? 'imperial' : 'metric';
    saving = true;
    await fetch('/api/preferences/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: next }),
    });
    location.reload();
  }
</script>

<button type="button" class="btn btn-outline-light btn-sm rounded-pill" onclick={toggle} disabled={saving}>
  {units === 'metric' ? 'km / m' : 'mi / ft'}
</button>

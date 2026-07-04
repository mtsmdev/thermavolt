<script lang="ts">
  let { device, class: className = '' }: { device: 'home' | 'water' | 'ev' | 'battery'; class?: string } = $props();
  const names = { home: 'House with rooftop PV panels', water: 'Solar water heater with horizontal tank and evacuated tubes', ev: 'Electric car and charging station', battery: 'Home storage battery' };
</script>

<img class={'device-art ' + className} src={'/images/devices/' + device + '.png'} alt={names[device]} draggable="false" />

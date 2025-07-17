
export function uid(): string {    
  let uid = ``;

  // create a 24length "random" string
  for (let i = 0; i < 24; i++) 
    uid += Math.floor(Math.random() * 16).toString(16)
  
  // timestamp that will be used to order the uid
  const ts = Math.floor(new Date().getTime() / 1000).toString(16)
  
  // replace the first 4 bytes with the timestamp
  return `${ts}${uid.slice(ts.length)}`.toUpperCase()
}

export function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function getCurrentDataTime(): string {
  const now = new Date()
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function sanitize(name: string): string {
  return name.trim()
    .slice(-255)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/?<>\\:*|"]/g, `-`)
    .replace(/^\.+$/, `-`)
    .replace(/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i, `-`)
    .replace(/[. ]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, `-`)
    .replace(/-{2,}/g, `-`)
    .replace(/^-+|-+$/g, '')
}


export default {
  getCurrentDataTime,
  pad,
  sanitize,
  uid,
}

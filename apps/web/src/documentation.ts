const docs='https://www.i-clusters.com/docs.html#';
const proxmox=docs+'manual-docs-proxmox-connection-md';

export const documentation={
 index:docs+'manual-docs-readme-md',
 signIn:docs+'manual-docs-browser-sessions-md',
 ownerSetup:docs+'first-login',
 networkSecurity:docs+'manual-security-md~deployment-responsibilities',
 networkTelemetry:docs+'manual-docs-network-telemetry-md',
 proxmoxToken:proxmox+'~create-a-dedicated-user-and-token',
 compose:docs+'manual-docs-docker-compose-md',
 trueNasCertificate:docs+'manual-docs-truenas-certificate-md',
 trueNasGenerate:docs+'manual-docs-truenas-certificate-md~create-a-certificate-for-an-ip-address',
};

const proxmoxSections:Record<string,string>={
 Nodes:'nodes-and-services',
 'Virtual Machines':'virtual-machines',
 'LXC Containers':'lxc-containers',
 Storage:'proxmox-storage',
 Networks:'proxmox-networks',
 'Tasks & Logs':'tasks-and-logs',
};

export function proxmoxDocumentation(tab:string){
 const section=proxmoxSections[tab];
 return section?proxmox+'~'+section:proxmox;
}

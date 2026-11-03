# VM and container storage allocation

Datasets / Volumes → Edit has two independent operations for Proxmox VMs:

1. **New total size** grows the provider's virtual disk to an absolute GiB size. It does not claim to grow the filesystem inside a VM. Wait for the Proxmox resize task to finish.
2. **Check usable space**, then **Expand guest filesystem**, uses capacity already assigned to the VM. It does not request a larger virtual disk. It inspects the root filesystem, partition, LVM physical and logical volume, expands the applicable layers, and reads filesystem capacity again. An unchanged capacity is reported as unchanged, not as extra usable space.

A 120 GiB virtual disk can contain a 56 GiB filesystem. Used + available is a filesystem measurement, not the size of the partition or virtual disk. Filesystem metadata, reserved blocks and other partitions also consume space. Existing used bytes cannot become free bytes without removing data.

## Supported automatic VM expansion

The VM must be running with QEMU Guest Agent, Python 3, and guest-exec access enabled. Both the Proxmox configuration and guest must report exactly one data disk. The root filesystem must be writable ext4 or XFS, directly on that disk or its last partition. Simple linear LVM is supported only with one physical volume and one logical volume in its root volume group. All free extents in that group are assigned to the root logical volume. Disk shrinking, formatting and deletion are never performed.

Encrypted volumes, RAID, thin LVM, multiple logical volumes, multiple disks, non-final root partitions, Windows and other filesystem layouts require a guest-specific allocation plan. The editor displays the reason automatic expansion cannot proceed. No arbitrary commands, disk paths or mount points are accepted from the browser.

For an Ubuntu guest, install prerequisites **inside the VM**, not on the i-Clusters controller or Proxmox host:

```bash
sudo apt update
sudo apt install qemu-guest-agent python3 cloud-guest-utils lvm2 e2fsprogs xfsprogs
sudo systemctl enable --now qemu-guest-agent
```

Enable QEMU Guest Agent in the VM's Proxmox Options as well. A VM restart may be needed after changing that option. Required resize tools are checked before any changes; the application does not install packages. If the guest still sees the old virtual disk size, rescan it using its OS-supported procedure or reboot the VM, then check again.

Take a current backup before expanding. The action requires an administrator, explicit confirmation and the existing node password approval. It rechecks controller connection, VM configuration revision and guest topology, then uses a guest OS lock to prevent duplicate expansions. It runs fixed commands using argument arrays, without a shell. A partial failure identifies the stage and requires a fresh check before retrying. A timed-out request has an unknown outcome; inspect the guest before repeating it. Growth cannot be rolled back by shrinking.

## Containers

CT discovery reads each container's `rootfs` and `mpN` configuration in addition to pool content. This includes managed CT volumes absent from the pool listing or labelled `images`. Volumes retain their actual owner node and mount point. Bind/device mounts appear separately and cannot be resized by this editor; their capacity is managed on the host. A failed CT configuration read marks coverage as partial instead of silently hiding the failure.

Managed CT disks use Proxmox's LXC resize operation, which handles supported container filesystems. They do not run the VM guest expansion script. The root filesystem usage reading is attached only to the root entry, never reused as usage for every CT mount point. Unknown sizes and usage remain unknown.

## Validation scope

Automated tests exercise inventory reconciliation, configuration and topology guards, authorization targeting, fixed command construction, resize order, verified capacity reporting, partial failure handling and browser forms. They do not resize production guests. Real guest compatibility depends on the guest OS, storage layout, tools and Proxmox privileges.

References: [Proxmox VM commands](https://pve.proxmox.com/pve-docs/qm.1.html), [Proxmox container commands](https://pve.proxmox.com/pve-docs/pct.1.html), [Ubuntu logical volumes](https://ubuntu.com/server/docs/how-to/storage/manage-logical-volumes/), [pvresize](https://manpages.ubuntu.com/manpages/noble/man8/pvresize.8.html).
